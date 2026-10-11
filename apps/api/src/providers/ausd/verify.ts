import { AUSD_ETHEREUM_SEPOLIA, type CheckoutPurchase } from "@impacks/contracts";
import { decodeEventLog, erc20Abi, TransactionReceiptNotFoundError, type Hash } from "viem";
import { z } from "zod";
import { HttpError } from "../../errors.js";
import type { PaymentEvidence } from "../../storage/checkout.js";
import { createAusdClient, readAusdConfig } from "./index.js";

export type VerificationClient = Pick<ReturnType<typeof createAusdClient>, "getChainId" | "getTransactionReceipt" | "getBlockNumber" | "getBlock" | "readContract">;
export interface PaymentVerifier { verify(purchase: CheckoutPurchase, hash: Hash): Promise<PaymentEvidence> }
const confirmationSchema = z.coerce.number().int().min(12).max(10000);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const invalid = (message: string): never => { throw new HttpError(422, "INVALID_PAYMENT", message); };

export class AusdPaymentVerifier implements PaymentVerifier {
  constructor(private readonly client: VerificationClient, private readonly confirmations = 12) {
    confirmationSchema.parse(confirmations);
  }

  async verify(purchase: CheckoutPurchase, hash: Hash): Promise<PaymentEvidence> {
    try {
      if (await this.client.getChainId() !== AUSD_ETHEREUM_SEPOLIA.chainId || purchase.chainId !== AUSD_ETHEREUM_SEPOLIA.chainId) {
        throw new HttpError(503, "WRONG_PAYMENT_NETWORK", "Payment RPC must use Ethereum Sepolia.");
      }
      if (!same(purchase.tokenAddress, AUSD_ETHEREUM_SEPOLIA.tokenAddress) || purchase.decimals !== 6) invalid("Unsupported payment asset.");
      const receipt = await this.client.getTransactionReceipt({ hash });
      if (!same(receipt.transactionHash, hash)) invalid("Receipt transaction does not match.");
      if (receipt.status !== "success") invalid("Transaction reverted.");
      const head = await this.client.getBlockNumber({ cacheTime: 0 });
      if (head < receipt.blockNumber || head - receipt.blockNumber + 1n < BigInt(this.confirmations)) {
        throw new HttpError(425, "PAYMENT_PENDING", "Wait for more confirmations and retry the same transaction hash.");
      }
      const block = await this.client.getBlock({ blockNumber: receipt.blockNumber });
      if (!block.hash || !same(block.hash, receipt.blockHash)) {
        throw new HttpError(425, "PAYMENT_PENDING", "Receipt is not in the canonical block. Retry later.");
      }
      const minedAt = block.timestamp * 1000n;
      if (minedAt < BigInt(Date.parse(purchase.createdAt)) || minedAt >= BigInt(Date.parse(purchase.expiresAt))) {
        invalid("Transfer must be mined within the checkout creation and expiration window.");
      }
      const decimals = await this.client.readContract({ address: AUSD_ETHEREUM_SEPOLIA.tokenAddress,
        abi: erc20Abi, functionName: "decimals", blockNumber: receipt.blockNumber });
      if (decimals !== 6) invalid("Unexpected AUSD token decimals.");
      const matching = receipt.logs.filter(log => {
        if (!same(log.address, purchase.tokenAddress) || log.removed || log.topics.length !== 3 || log.data.length !== 66) return false;
        if (!log.transactionHash || !same(log.transactionHash, hash) || !log.blockHash || !same(log.blockHash, receipt.blockHash)
          || log.blockNumber !== receipt.blockNumber || log.logIndex === null) return false;
        try {
          const event = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", topics: log.topics, data: log.data, strict: true });
          return same(event.args.from, purchase.buyerAddress) && same(event.args.to, purchase.recipientAddress);
        } catch { return false; }
      });
      // A batch of two transfers is not an exact single payment for one purchase.
      if (matching.length !== 1) invalid("Expected exactly one AUSD Transfer from buyer to recipient.");
      const log = matching[0];
      const event = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", topics: log.topics, data: log.data, strict: true });
      if (event.args.value !== BigInt(purchase.amountAtomic)) invalid("Transfer amount does not match the checkout.");
      // Re-read canonical inclusion after contract/log checks to catch a reorg during verification.
      const canonical = await this.client.getBlock({ blockNumber: receipt.blockNumber });
      if (!canonical.hash || !same(canonical.hash, receipt.blockHash)) {
        throw new HttpError(425, "PAYMENT_PENDING", "Chain changed during verification. Retry later.");
      }
      return { transactionHash: hash.toLowerCase(), blockNumber: receipt.blockNumber.toString(),
        blockHash: receipt.blockHash, logIndex: log.logIndex! };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof TransactionReceiptNotFoundError) {
        throw new HttpError(425, "PAYMENT_PENDING", "Transaction is not mined or not yet available. Retry the same hash.");
      }
      // Never leak credential-bearing RPC URLs, and never persist an RPC error as payment failure.
      throw new HttpError(503, "PAYMENT_RPC_UNAVAILABLE", "Payment RPC is temporarily unavailable. Retry the same transaction hash.");
    }
  }
}

/** Lazy configuration keeps unrelated demo routes usable without RPC credentials. */
export function configuredPaymentVerifier(): PaymentVerifier {
  return { async verify(purchase, hash) {
    let verifier: AusdPaymentVerifier;
    try {
      const config = readAusdConfig();
      if (!config.recipientAddress) throw new Error("Missing recipient");
      const confirmations = confirmationSchema.parse(process.env.AUSD_MIN_CONFIRMATIONS ?? "12");
      verifier = new AusdPaymentVerifier(createAusdClient(config), confirmations);
    } catch {
      throw new HttpError(503, "PAYMENT_NOT_CONFIGURED", "Configure Ethereum Sepolia RPC, AUSD token, recipient and at least 12 confirmations.");
    }
    return verifier.verify(purchase, hash);
  } };
}
