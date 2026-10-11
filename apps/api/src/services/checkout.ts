import { randomUUID } from "node:crypto";
import { getAddress, isAddress, type Hash } from "viem";
import { AUSD_ETHEREUM_SEPOLIA, centsToAtomic, checkoutSchema, walletAddressSchema, type CheckoutPurchase, type CheckoutRequest } from "@impacks/contracts";
import { packs } from "../providers/demo.js";
import { HttpError } from "../errors.js";
import { CheckoutStore } from "../storage/checkout.js";
import type { PaymentVerifier } from "../providers/ausd/verify.js";

const prices = {
  starter: { amount: "1", amountAtomic: "1000000" },
  premium: { amount: "3", amountAtomic: "3000000" },
  ultimate: { amount: "5", amountAtomic: "5000000" },
} as const satisfies Record<Exclude<CheckoutRequest["packType"], "category">, { amount: string; amountAtomic: string }>;
const expiresAfterMs = 15 * 60_000;

/** Confirms a payment record only. It never issues packs or grants a user entitlement. */
export class CheckoutService {
  constructor(private readonly recipientAddress: string | undefined,
    private readonly store: CheckoutStore, private readonly verifier: PaymentVerifier) {}

  create(input: CheckoutRequest, authenticatedWallet: string, key?: string): CheckoutPurchase {
    input = checkoutSchema.parse(input);
    if (input.packType === "category" && (!key || !/^[a-zA-Z0-9_-]{8,128}$/.test(key))) throw new HttpError(400, "INVALID_KEY", "Supply an Idempotency-Key for category checkout.");
    if (key && !/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new HttpError(400, "INVALID_KEY", "Invalid checkout key.");
    const recipient = walletAddressSchema.safeParse(this.recipientAddress);
    if (!recipient.success || !isAddress(recipient.data)) {
      throw new HttpError(503, "CHECKOUT_NOT_CONFIGURED", "Configure a valid AUSD_RECIPIENT_ADDRESS before creating checkout requests.");
    }
    if (input.buyerAddress && !isAddress(input.buyerAddress)) {
      throw new HttpError(400, "INVALID_REQUEST", "Buyer wallet address has an invalid checksum.");
    }
    if (input.buyerAddress && input.buyerAddress.toLowerCase() !== authenticatedWallet.toLowerCase()) {
      throw new HttpError(403, "WALLET_MISMATCH", "Buyer must match the authenticated wallet.");
    }
    if (authenticatedWallet.toLowerCase() === recipient.data.toLowerCase()) {
      throw new HttpError(400, "INVALID_REQUEST", "Buyer and receiving wallet must differ.");
    }
    const catalog = input.packType === "category" ? packs.find(pack => pack.id === input.packId) : undefined;
    if (input.packType === "category" && !catalog) throw new HttpError(404, "PACK_NOT_FOUND", "Edition is unavailable.");
    const pack = catalog ? { ...catalog, budgetCents: input.budgetCents!, priceAtomic: centsToAtomic(input.budgetCents!), name: `${catalog.name} · $${input.budgetCents! / 100}` } : undefined;
    const price = pack ? { amount: String(pack.budgetCents / 100), amountAtomic: pack.priceAtomic } : prices[input.packType as keyof typeof prices];
    const fingerprint = JSON.stringify({ packType: input.packType, packId: input.packId, budgetCents: input.budgetCents });
    const now = Date.now();
    const purchase: CheckoutPurchase = {
      purchaseId: randomUUID(), packType: input.packType,
      buyerAddress: getAddress(authenticatedWallet), asset: "AUSD", ...price, ...(pack ? { pack } : {}),
      decimals: AUSD_ETHEREUM_SEPOLIA.decimals, tokenAddress: AUSD_ETHEREUM_SEPOLIA.tokenAddress,
      chainId: AUSD_ETHEREUM_SEPOLIA.chainId, recipientAddress: getAddress(recipient.data),
      createdAt: new Date(now).toISOString(), expiresAt: new Date(now + expiresAfterMs).toISOString(),
      status: "pending", mode: "ausd-testnet", storage: this.store.storage, paymentEnabled: false,
      updatedAt: new Date(now).toISOString(), expiredAt: null, confirmedAt: null,
      transactionHash: null, paymentBlockNumber: null, paymentBlockHash: null, paymentLogIndex: null,
    };
    return this.store.transaction(() => {
      if (key) {
        const existing = this.store.db.prepare("SELECT purchase_id, fingerprint FROM checkout_keys WHERE owner_wallet=? AND request_key=?").get(authenticatedWallet.toLowerCase(), key);
        if (existing) {
          if (existing.fingerprint !== fingerprint) throw new HttpError(409, "KEY_REUSED", "Retry the original edition and budget with this key.");
          return this.get(existing.purchase_id as string, authenticatedWallet);
        }
      }
      this.store.insert(purchase, authenticatedWallet);
      if (key) this.store.db.prepare("INSERT INTO checkout_keys VALUES (?, ?, ?, ?)").run(authenticatedWallet.toLowerCase(), key, fingerprint, purchase.purchaseId);
      return { ...purchase };
    });
  }

  get(purchaseId: string, authenticatedWallet: string): CheckoutPurchase {
    this.store.getOwned(purchaseId, authenticatedWallet);
    return this.store.expire(purchaseId, new Date(Date.now()).toISOString());
  }

  async verify(purchaseId: string, hash: Hash, authenticatedWallet: string): Promise<CheckoutPurchase> {
    const purchase = this.get(purchaseId, authenticatedWallet);
    if (purchase.status === "confirmed") {
      if (purchase.transactionHash !== hash.toLowerCase()) {
        throw new HttpError(409, "PURCHASE_ALREADY_CONFIRMED", "Purchase is already confirmed with another transaction.");
      }
      return purchase;
    }
    this.store.assertHashAvailable(purchaseId, hash);
    const evidence = await this.verifier.verify(purchase, hash);
    // Even an expired record can reconcile an on-time mined payment after an RPC outage.
    return this.store.confirm(purchaseId, evidence);
  }
}
