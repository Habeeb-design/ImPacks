import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { AUSD_ETHEREUM_SEPOLIA } from "@impacks/contracts";
import { readAusdConfig } from "../providers/ausd/index.js";
import type { RefundTransport } from "./ports.js";

/** Loaded only by the worker, never the API or the Next.js proxy. */
export function createRefundTransport(env: NodeJS.ProcessEnv = process.env): RefundTransport | undefined {
  if (env.AUSD_REFUND_BROADCAST_ENABLED !== "1") return undefined;
  const config = readAusdConfig(env);
  if (!/^0x[0-9a-fA-F]{64}$/.test(env.AUSD_REFUND_PRIVATE_KEY ?? "")) throw new Error("Configure a dedicated refund signing key in worker secrets");
  const account = privateKeyToAccount(env.AUSD_REFUND_PRIVATE_KEY as Hex);
  if (account.address.toLowerCase() !== config.recipientAddress?.toLowerCase()) throw new Error("Refund key does not control payment treasury");
  const transport = http(config.rpcUrl, { timeout: 10000, retryCount: 0 });
  const client = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ chain: sepolia, transport, account });
  async function check() {
    if (await client.getChainId() !== sepolia.id) throw new Error("Wrong refund network");
    if (await client.getBalance({ address: account.address }) === 0n) throw new Error("Refund treasury needs Sepolia ETH for gas");
  }
  return {
    async pendingNonce() { await check(); return client.getTransactionCount({ address: account.address, blockTag: "pending" }); },
    async sign({ to, amountAtomic, nonce }) {
      await check();
      const amount = BigInt(amountAtomic);
      if (amount <= 0n || !Number.isSafeInteger(nonce) || nonce < 0) throw new Error("Invalid refund instruction");
      const balance = await client.readContract({ address: AUSD_ETHEREUM_SEPOLIA.tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
      if (balance < amount) throw new Error("Insufficient treasury AUSD for refund");
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to as Hex, amount] });
      const gas = await client.estimateGas({ account: account.address, to: AUSD_ETHEREUM_SEPOLIA.tokenAddress, data, value: 0n });
      const fees = await client.estimateFeesPerGas();
      const gasLimit = gas * 120n / 100n;
      if (gasLimit > 150000n || fees.maxFeePerGas > 100000000000n) throw new Error("Refund gas estimate exceeds configured safety bounds");
      if (await client.getBalance({ address: account.address }) < gasLimit * fees.maxFeePerGas) throw new Error("Insufficient refund gas funds");
      return wallet.signTransaction({ chain: sepolia, account, to: AUSD_ETHEREUM_SEPOLIA.tokenAddress, data, value: 0n,
        nonce, gas: gasLimit, ...fees, type: "eip1559" });
    },
    async broadcast(serialized) { await check(); return client.sendRawTransaction({ serializedTransaction: serialized }); },
  };
}
