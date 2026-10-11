import { AUSD_BASE_SEPOLIA } from "@impacks/contracts";
import { createPublicClient, erc20Abi, getAddress, http, isAddress, zeroAddress, type PublicClient, type HttpTransport } from "viem";
import { baseSepolia } from "viem/chains";

/** Server-only configuration. No signer or private key is needed for reads. */
export function readAusdConfig(env: NodeJS.ProcessEnv = process.env) {
  let rpcUrl: URL;
  try { rpcUrl = new URL(env.AUSD_RPC_URL ?? ""); }
  catch { throw new Error("Set AUSD_RPC_URL to a Base Sepolia HTTP(S) RPC URL."); }
  if (!["http:", "https:"].includes(rpcUrl.protocol)) {
    throw new Error("AUSD_RPC_URL must use HTTP(S).");
  }
  const token = env.AUSD_CONTRACT_ADDRESS;
  if (!token || !isAddress(token) || token.toLowerCase() !== AUSD_BASE_SEPOLIA.tokenAddress.toLowerCase()) {
    throw new Error("AUSD_CONTRACT_ADDRESS must be the official Agora Base Sepolia deployment.");
  }
  const recipient = env.AUSD_RECIPIENT_ADDRESS;
  if (recipient && (!isAddress(recipient) || recipient.toLowerCase() === zeroAddress)) {
    throw new Error("AUSD_RECIPIENT_ADDRESS must be a valid nonzero wallet address.");
  }
  return {
    rpcUrl: rpcUrl.toString(), tokenAddress: getAddress(token),
    recipientAddress: recipient ? getAddress(recipient) : null,
  };
}

export function createAusdClient(config: ReturnType<typeof readAusdConfig>): PublicClient<HttpTransport, typeof baseSepolia> {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(config.rpcUrl, { timeout: 10_000, retryCount: 1 }),
  });
}

/** Connectivity only: this does not verify a payment or implement PaymentProvider. */
export async function verifyAusdConnectivity(config = readAusdConfig()) {
  const client = createAusdClient(config);
  const chainId = await client.getChainId();
  if (chainId !== AUSD_BASE_SEPOLIA.chainId) throw new Error("RPC is not connected to Base Sepolia (84532).");
  const blockNumber = await client.getBlockNumber();
  const code = await client.getCode({ address: config.tokenAddress, blockNumber });
  if (!code || code === "0x") throw new Error("No AUSD contract bytecode found on Base Sepolia.");
  const decimals = await client.readContract({
    address: config.tokenAddress, abi: erc20Abi, functionName: "decimals", blockNumber,
  });
  if (decimals !== AUSD_BASE_SEPOLIA.decimals) throw new Error("AUSD token decimals differ from the expected 6.");
  return { chainId, blockNumber: blockNumber.toString(), tokenAddress: config.tokenAddress,
    decimals, recipientConfigured: config.recipientAddress !== null };
}
