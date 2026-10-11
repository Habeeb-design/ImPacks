import { createPublicClient, createWalletClient, decodeEventLog, encodeFunctionData, erc20Abi, http, keccak256, parseTransaction, TransactionReceiptNotFoundError, type Hex, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { AUSD_ETHEREUM_SEPOLIA, WELCOME_GRANT_AMOUNT_ATOMIC } from "@impacks/contracts";
import type { GrantTransfer } from "./worker.js";
import type { GrantConfig } from "./config.js";

const token = AUSD_ETHEREUM_SEPOLIA.tokenAddress as Hex;
const amount = BigInt(WELCOME_GRANT_AMOUNT_ATOMIC);

export function createGrantChain(config: GrantConfig, privateKey: Hex,
  transport: Transport = http(config.rpcUrl, { timeout: 8000, retryCount: 0 })): GrantTransfer {
  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== config.treasury) throw new Error("Funding key does not match configured treasury");
  const client = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });

  async function verifyChain() {
    if (await client.getChainId() !== 11155111) throw new Error("Welcome grants require Ethereum Sepolia");
  }
  return {
    async prepare(recipient) {
      await verifyChain();
      if (recipient.toLowerCase() === config.treasury) throw new Error("Cannot grant to the treasury");
      const [decimals, balance, eth, nonce, latestNonce] = await Promise.all([
        client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
        client.getBalance({ address: account.address }),
        client.getTransactionCount({ address: account.address, blockTag: "pending" }),
        client.getTransactionCount({ address: account.address, blockTag: "latest" }),
      ]);
      if (decimals !== 6 || balance < amount) throw new Error("AUSD token or balance unavailable");
      if (nonce !== latestNonce) throw new Error("Treasury has an untracked pending transaction");
      const request = await wallet.prepareTransactionRequest({
        to: token, value: 0n, nonce,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, amount] }),
      });
      const gasCost = request.gas * (request.maxFeePerGas ?? request.gasPrice ?? 0n);
      // Small, dedicated testnet faucet: cap fees and keep a native ETH reserve.
      if (gasCost <= 0n || gasCost > 100_000_000_000_000n || eth < gasCost * 2n + 10_000_000_000_000n) {
        throw new Error("Insufficient test ETH or excessive gas quote");
      }
      const raw = await wallet.signTransaction(request);
      return { raw, hash: keccak256(raw), nonce };
    },
    async inspect(hash, recipient) {
      await verifyChain();
      let receipt;
      try { receipt = await client.getTransactionReceipt({ hash }); }
      catch (error) { if (error instanceof TransactionReceiptNotFoundError) return "missing"; throw error; }
      // Wait for a canonical safe block, not just the first inclusion receipt.
      const [safe, block] = await Promise.all([
        client.getBlock({ blockTag: "safe" }), client.getBlock({ blockNumber: receipt.blockNumber }),
      ]);
      if (block.hash !== receipt.blockHash || safe.number < receipt.blockNumber) return "pending";
      if (receipt.status === "reverted") return "failed";
      if (receipt.from.toLowerCase() !== config.treasury || receipt.to?.toLowerCase() !== token.toLowerCase()) return "invalid";
      const matches = receipt.logs.filter(log => {
        if (log.address.toLowerCase() !== token.toLowerCase()) return false;
        try {
          const decoded = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data, topics: log.topics });
          return decoded.args.from.toLowerCase() === config.treasury
            && decoded.args.to.toLowerCase() === recipient.toLowerCase() && decoded.args.value === amount;
        } catch { return false; }
      });
      return matches.length === 1 ? "confirmed" : "invalid";
    },
    async nonceConsumed(nonce) {
      await verifyChain();
      return await client.getTransactionCount({ address: account.address, blockTag: "latest" }) > nonce;
    },
    async broadcast(raw, expectedHash) {
      await verifyChain();
      if (parseTransaction(raw).chainId !== AUSD_ETHEREUM_SEPOLIA.chainId) {
        throw new Error("Stored transaction is not signed for Ethereum Sepolia");
      }
      if (keccak256(raw) !== expectedHash) throw new Error("Stored transaction hash mismatch");
      const hash = await client.sendRawTransaction({ serializedTransaction: raw });
      if (hash !== expectedHash) throw new Error("RPC returned a different transaction hash");
    },
  };
}
