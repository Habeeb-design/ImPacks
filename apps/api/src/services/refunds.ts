import { createHash, randomUUID } from "node:crypto";
import { AUSD_ETHEREUM_SEPOLIA, type AusdRefund, type SandboxExecution } from "@impacks/contracts";
import { decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, keccak256, parseTransaction, recoverTransactionAddress, type Hex } from "viem";
import { CheckoutStore, type PaymentEvidence } from "../storage/checkout.js";
import { ExecutionService } from "./execution.js";
import { HttpError } from "../errors.js";

export interface FinalSettlement {
  spentAtomic?: string; reference: string; executionDigest: string; feesReconciled: true; ordersFinalized: true;
  noFurtherOrders: true; paymentRevalidated: true;
}
/** Trusted reconciler verifies exchange evidence and revalidates the original payment.
 * No HTTP body/env flag may provide this attestation. Disabled pipeline wiring returns null. */
export interface SettlementAuthority { readFinal(execution: SandboxExecution): FinalSettlement | null }
export interface RefundVerifier { verify(refund: AusdRefund): Promise<PaymentEvidence> }
export const executionDigest = (value: SandboxExecution) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const blocked = (message: string): never => { throw new HttpError(409, "REFUND_BLOCKED", message); };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function refundAccounting(depositAtomic: string, execution: SandboxExecution) {
  if (!/^[0-9]+$/.test(depositAtomic)) blocked("Invalid deposit.");
  const deposit = BigInt(depositAtomic);
  let spent = 0n;
  for (const order of execution.orders) {
    for (const amount of [order.costCents, order.feeCents]) {
      if (!Number.isSafeInteger(amount) || amount < 0) blocked("Invalid execution currency amount.");
      spent += BigInt(amount);
    }
  }
  if (spent > BigInt(Number.MAX_SAFE_INTEGER)) blocked("Execution currency overflow.");
  const remaining = deposit - spent * 10000n;
  const blockers: string[] = [];
  if (execution.orders.length !== execution.pack.cardCount || !execution.orders.length) blockers.push("ORDERS_NOT_PREPARED");
  if (execution.orders.some(o => !["filled", "cancelled", "rejected"].includes(o.state))) blockers.push("OUTSTANDING_ORDERS");
  if (["pending", "processing", "reconciliation-required"].includes(execution.state)) blockers.push("EXECUTION_NOT_FINAL");
  if (remaining < 0n) blockers.push("SPENDING_EXCEEDS_DEPOSIT");
  return { spentCents: Number(spent), candidateAtomic: (remaining > 0n ? remaining : 0n).toString(), blockers };
}

export class RefundService {
  constructor(private store: CheckoutStore, private treasury: string | undefined,
    private verifier: RefundVerifier, private authority: SettlementAuthority = { readFinal: () => null }) {}

  private execution(id: string) {
    return new ExecutionService(this.store, { listEligible: async () => { throw new Error("Refunds do not discover markets."); } }).get(id);
  }
  get(id: string): AusdRefund {
    const row = this.store.db.prepare("SELECT refund_json FROM ausd_refunds WHERE purchase_id = ?").get(id);
    if (!row) throw new HttpError(404, "REFUND_NOT_FOUND", "No refund preparation exists.");
    return JSON.parse(row.refund_json as string) as AusdRefund;
  }
  private snapshot(id: string) {
    const purchase = this.store.get(id);
    this.store.getOwned(id, purchase.buyerAddress);
    if (purchase.status !== "confirmed" || purchase.chainId !== 11155111 || purchase.decimals !== 6 ||
      !same(purchase.tokenAddress, AUSD_ETHEREUM_SEPOLIA.tokenAddress)) blocked("Confirmed Ethereum Sepolia AUSD deposit required.");
    const execution = this.execution(id);
    if (execution.purchaseId !== id || !same(execution.identity.walletAddress, purchase.buyerAddress) ||
      execution.identity.chainId !== 11155111 || execution.mode !== "sandbox" || execution.accountingRule !== "demo-nominal-1:1" ||
      !Number.isSafeInteger(execution.budgetCents) || BigInt(execution.budgetCents) * 10000n !== BigInt(purchase.amountAtomic)) blocked("Execution and deposit do not agree.");
    const account = refundAccounting(purchase.amountAtomic, execution);
    if (!this.treasury || !same(this.treasury, purchase.recipientAddress)) account.blockers.push("TREASURY_NOT_CONFIGURED_OR_CHANGED");
    const digest = executionDigest(execution);
    const final = this.authority.readFinal(execution);
    if (final?.spentAtomic !== undefined) {
      if (!/^\d+$/.test(final.spentAtomic)) blocked("Invalid final cost precision.");
      const exact = BigInt(purchase.amountAtomic) - BigInt(final.spentAtomic);
      if (exact < 0n) account.blockers.push("SPENDING_EXCEEDS_DEPOSIT");
      account.candidateAtomic = (exact > 0n ? exact : 0n).toString();
    }
    if (!final || final.executionDigest !== digest || !final.reference || final.feesReconciled !== true ||
      final.ordersFinalized !== true || final.noFurtherOrders !== true || final.paymentRevalidated !== true) account.blockers.push("AUTHORITATIVE_SETTLEMENT_REQUIRED");
    return { purchase, execution, account, digest, final };
  }
  prepare(id: string): AusdRefund {
    return this.store.transaction(() => {
      const existing = this.store.db.prepare("SELECT state FROM ausd_refunds WHERE purchase_id = ?").get(id);
      if (existing && existing.state !== "pending") return this.get(id);
      const { purchase, execution, account, digest } = this.snapshot(id);
      const now = new Date().toISOString();
      const previous = existing ? this.get(id) : null;
      const value: AusdRefund = { refundId: previous?.refundId ?? randomUUID(), purchaseId: id,
        fulfillmentId: execution.fulfillmentId, state: "pending", depositAtomic: purchase.amountAtomic,
        ...account, authorizedAtomic: null, recipientAddress: purchase.buyerAddress,
        treasuryAddress: purchase.recipientAddress, chainId: 11155111, tokenAddress: AUSD_ETHEREUM_SEPOLIA.tokenAddress,
        executionDigest: digest, settlementReference: null, broadcastEnabled: false, transactionHash: null,
        createdAt: previous?.createdAt ?? now, updatedAt: now, confirmedAt: null };
      if (!existing) this.store.db.prepare("INSERT INTO ausd_refunds (id, purchase_id, fulfillment_id, state, refund_json) VALUES (?, ?, ?, 'pending', ?)")
        .run(value.refundId, id, value.fulfillmentId, JSON.stringify(value));
      else this.save(value);
      return value;
    });
  }
  authorize(id: string): AusdRefund {
    return this.store.transaction(() => {
      const value = this.get(id);
      if (value.state !== "pending") return value;
      const { account, digest, final } = this.snapshot(id);
      if (account.blockers.length) blocked(account.blockers.join(", "));
      if (account.candidateAtomic === "0") blocked("No refundable balance.");
      Object.assign(value, account, { executionDigest: digest, authorizedAtomic: account.candidateAtomic,
        settlementReference: final!.reference, state: "authorized" });
      this.store.db.prepare("UPDATE ausd_refunds SET settlement_json = ? WHERE purchase_id = ?").run(JSON.stringify(final), id);
      this.save(value);
      return value;
    });
  }
  /** Reviewable unsigned call only. Does not allocate a nonce, sign, or send. */
  transferIntent(id: string) {
    const value = this.get(id);
    if (value.state !== "authorized" || !value.authorizedAtomic) blocked("Refund must be authorized first.");
    if (!this.treasury || !same(this.treasury, value.treasuryAddress)) blocked("Treasury changed.");
    return { chainId: 11155111 as const, from: getAddress(value.treasuryAddress), to: AUSD_ETHEREUM_SEPOLIA.tokenAddress,
      value: "0", data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer",
        args: [getAddress(value.recipientAddress), BigInt(value.authorizedAtomic!)] }), broadcastEnabled: false as const };
  }
  /** Server-side signer handoff ONLY; not exposed by any HTTP endpoint.
   * Signed identity and nonce commit before any possible network submission. */
  async stageSigned(id: string, serialized: Hex): Promise<AusdRefund> {
    if (!/^0x02(?:[0-9a-fA-F]{2})+$/.test(serialized)) blocked("Only signed EIP-1559 testnet transactions are supported.");
    const sender = await recoverTransactionAddress({ serializedTransaction: serialized as `0x02${string}` });
    const tx = parseTransaction(serialized);
    return this.store.transaction(() => {
      const value = this.get(id), hash = keccak256(serialized);
      if (value.transactionHash === hash) return value;
      const intent = this.transferIntent(id);
      if (tx.type !== "eip1559" || tx.chainId !== 11155111 || !tx.to || !same(tx.to, intent.to) ||
        !same(sender, intent.from) || (tx.value ?? 0n) !== 0n || tx.data !== intent.data ||
        !Number.isSafeInteger(tx.nonce) || tx.nonce! < 0 || !tx.gas || tx.gas <= 0n || tx.gas > 150000n ||
        tx.maxFeePerGas === undefined || tx.maxFeePerGas > 100000000000n ||
        tx.maxPriorityFeePerGas === undefined || tx.maxPriorityFeePerGas > tx.maxFeePerGas) blocked("Signed transaction does not match the authorized testnet refund.");
      // Exact encoding prevents alternate function calls, recipients or amounts.
      decodeFunctionData({ abi: erc20Abi, data: tx.data! });
      const nonceOwner = this.store.db.prepare("SELECT id FROM ausd_refunds WHERE treasury_address = ? AND nonce = ?").get(sender, tx.nonce!);
      if (nonceOwner) blocked("Treasury nonce already reserved. Reconcile the original refund.");
      value.transactionHash = hash; value.state = "submitting";
      this.store.db.prepare("UPDATE ausd_refunds SET transaction_hash = ?, treasury_address = ?, nonce = ?, signed_transaction = ? WHERE purchase_id = ?")
        .run(hash, sender, tx.nonce!, serialized, id);
      this.save(value);
      return value;
    });
  }
  broadcast(): never {
    throw new HttpError(503, "REFUND_BROADCAST_DISABLED", "Broadcasting is disabled. Explicit approval and signer integration are required.");
  }
  async reconcile(id: string): Promise<AusdRefund> {
    const value = this.get(id);
    if (["confirmed", "failed"].includes(value.state)) return value;
    if (!value.transactionHash) blocked("No durably staged transaction to reconcile.");
    let evidence: PaymentEvidence | null = null;
    let next: AusdRefund["state"] = "reconciliation-required";
    try { evidence = await this.verifier.verify(value); next = "confirmed"; }
    catch (error) {
      if (error instanceof HttpError && error.code === "REFUND_MINED_PENDING") next = "submitted";
      if (error instanceof HttpError && error.code === "REFUND_REVERTED") next = "failed";
      // Not found, timeout, reorg or invalid transfer: retain original signed identity; never retry with a new nonce.
    }
    return this.store.transaction(() => {
      const current = this.get(id);
      if (["confirmed", "failed"].includes(current.state)) return current;
      if (current.transactionHash !== value.transactionHash) blocked("Refund identity changed.");
      current.state = next;
      if (next === "confirmed") current.confirmedAt = new Date().toISOString();
      if (evidence) this.store.db.prepare("UPDATE ausd_refunds SET evidence_json = ? WHERE purchase_id = ?").run(JSON.stringify(evidence), id);
      this.save(current);
      return current;
    });
  }
  private save(value: AusdRefund) {
    value.updatedAt = new Date().toISOString();
    this.store.db.prepare("UPDATE ausd_refunds SET state = ?, refund_json = ? WHERE purchase_id = ?")
      .run(value.state, JSON.stringify(value), value.purchaseId);
  }
}
