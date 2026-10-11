import { AUSD_ETHEREUM_SEPOLIA, type AusdRefund, type CheckoutPurchase } from "@impacks/contracts";
import type { Hash } from "viem";
import { HttpError } from "../../errors.js";
import { AusdPaymentVerifier, type VerificationClient } from "./verify.js";
import { createAusdClient, readAusdConfig } from "./index.js";
import type { RefundVerifier } from "../../services/refunds.js";

/** Read-only reconciliation of a pre-staged hash. No wallet client or broadcast transport. */
export class AusdRefundVerifier implements RefundVerifier {
  constructor(private client: VerificationClient, private confirmations = 12) {
    new AusdPaymentVerifier(client, confirmations); // Preserve the >=12 configuration validation.
  }
  async verify(refund: AusdRefund) {
    if (!refund.transactionHash || !refund.authorizedAtomic) throw new HttpError(409, "REFUND_NOT_STAGED", "Refund transaction not staged.");
    try {
      if (await this.client.getChainId() !== 11155111) throw new Error("Wrong network");
      const receipt = await this.client.getTransactionReceipt({ hash: refund.transactionHash as Hash });
      if (receipt.transactionHash.toLowerCase() !== refund.transactionHash.toLowerCase()) throw new Error("Wrong receipt");
      const head = await this.client.getBlockNumber({ cacheTime: 0 });
      if (head < receipt.blockNumber || head - receipt.blockNumber + 1n < BigInt(this.confirmations)) {
        throw new HttpError(425, "REFUND_MINED_PENDING", "Refund mined; awaiting confirmations.");
      }
      if (receipt.status === "reverted") {
        for (let i = 0; i < 2; i++) {
          const block = await this.client.getBlock({ blockNumber: receipt.blockNumber });
          if (!block.hash || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error("Reorg");
        }
        throw new HttpError(422, "REFUND_REVERTED", "Canonical refund transaction reverted; do not retry automatically.");
      }
      // Reuse all strict chain/token/Transfer/amount/decimals/canonical-inclusion checks, reversing payer/recipient.
      const instruction = { purchaseId: refund.purchaseId, buyerAddress: refund.treasuryAddress,
        recipientAddress: refund.recipientAddress, amountAtomic: refund.authorizedAtomic,
        tokenAddress: AUSD_ETHEREUM_SEPOLIA.tokenAddress, chainId: 11155111, decimals: 6,
        createdAt: refund.createdAt, expiresAt: "9999-12-31T23:59:59.999Z" } as CheckoutPurchase;
      return await new AusdPaymentVerifier(this.client, this.confirmations).verify(instruction, refund.transactionHash as Hash);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, "REFUND_RPC_UNAVAILABLE", "Unable to establish refund outcome. Reconcile the same hash.");
    }
  }
}
export function configuredRefundVerifier(): RefundVerifier {
  return { async verify(refund) {
    try {
      const config = readAusdConfig();
      if (!config.recipientAddress || config.recipientAddress.toLowerCase() !== refund.treasuryAddress.toLowerCase()) throw new Error("Treasury mismatch");
      return await new AusdRefundVerifier(createAusdClient(config), Number(process.env.AUSD_MIN_CONFIRMATIONS ?? 12)).verify(refund);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, "REFUND_NOT_CONFIGURED", "Configure Ethereum Sepolia read-only refund reconciliation.");
    }
  } };
}
