import test from "node:test";
import assert from "node:assert/strict";
import { custom, decodeFunctionData, encodeAbiParameters, encodeEventTopics, erc20Abi, keccak256, parseTransaction, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AUSD_ETHEREUM_SEPOLIA } from "@impacks/contracts";
import { createGrantChain } from "../src/grants/chain.js";
import type { GrantConfig } from "../src/grants/config.js";

// Public test-only key. No environment secrets or network are used in these tests.
const key = `0x${"01".repeat(32)}` as Hex;
const treasury = privateKeyToAccount(key).address.toLowerCase() as Hex;
const recipient = `0x${"12".repeat(20)}` as Hex;
const blockHash = `0x${"aa".repeat(32)}` as Hex;
const txHash = `0x${"bb".repeat(32)}` as Hex;
const config: GrantConfig = { appId: "app", startsAt: new Date(), databaseUrl: "unused", rpcUrl: "unused", treasury, dailyLimit: 100 };

function rpc() {
  const state = { chainId: 11155111, decimals: 6n, balance: 100_000_000n, eth: 10n ** 18n, safeNumber: 16,
    canonicalHash: blockHash, receipt: true, status: "0x1", logAmount: 50_000_000n, logTo: recipient, logToken: AUSD_ETHEREUM_SEPOLIA.tokenAddress };
  const requests: string[] = [];
  const transport = custom({ async request({ method, params }) {
    requests.push(method);
    const args = params as any[];
    switch (method) {
      case "eth_chainId": return toHex(state.chainId);
      case "eth_getBalance": return toHex(state.eth);
      case "eth_getTransactionCount": return "0x4";
      case "eth_maxPriorityFeePerGas": return "0xf4240";
      case "eth_gasPrice": return "0xf4240";
      case "eth_estimateGas": return "0x11170";
      case "eth_call": return encodeAbiParameters([{ type: "uint256" }], [args[0].data === "0x313ce567" ? state.decimals : state.balance]);
      case "eth_sendRawTransaction": return keccak256(args[0]);
      case "eth_getBlockByNumber": return { number: toHex(args[0] === "safe" ? state.safeNumber : 16), hash: state.canonicalHash,
        transactions: [], gasLimit: "0x1c9c380", gasUsed: "0x11170", size: "0x0", timestamp: "0x1", difficulty: "0x0", totalDifficulty: "0x0", baseFeePerGas: "0xf4240" };
      case "eth_getTransactionReceipt": return state.receipt ? {
        transactionHash: txHash, transactionIndex: "0x0", blockHash, blockNumber: "0x10", from: treasury,
        to: AUSD_ETHEREUM_SEPOLIA.tokenAddress, cumulativeGasUsed: "0x11170", gasUsed: "0x11170", effectiveGasPrice: "0xf4240",
        status: state.status, type: "0x2", contractAddress: null, logsBloom: `0x${"00".repeat(256)}`,
        logs: [{ address: state.logToken, blockHash, blockNumber: "0x10", transactionHash: txHash, transactionIndex: "0x0", logIndex: "0x0", removed: false,
          topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: treasury, to: state.logTo } }),
          data: encodeAbiParameters([{ type: "uint256" }], [state.logAmount]) }],
      } : null;
      default: throw new Error(`Unexpected test RPC ${method}`);
    }
  } }, { retryCount: 0 });
  return { state, requests, chain: createGrantChain(config, key, transport) };
}

test("chain adapter signs exactly 50 test AUSD to the verified recipient and does not broadcast during preparation", async () => {
  const { chain, requests } = rpc();
  const prepared = await chain.prepare(recipient);
  const tx = parseTransaction(prepared.raw);
  assert.equal(tx.chainId, 11155111);
  assert.equal(tx.to?.toLowerCase(), AUSD_ETHEREUM_SEPOLIA.tokenAddress.toLowerCase());
  assert.equal(tx.value ?? 0n, 0n);
  assert.equal(tx.nonce, 4);
  const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data! });
  assert.equal(decoded.functionName, "transfer");
  assert.deepEqual(decoded.args, [recipient, 50_000_000n]);
  assert.equal(prepared.hash, keccak256(prepared.raw));
  assert.ok(!requests.includes("eth_sendRawTransaction"));
  await chain.broadcast(prepared.raw, prepared.hash);
  assert.ok(requests.includes("eth_sendRawTransaction"));
  await assert.rejects(chain.broadcast(prepared.raw, txHash), /hash mismatch/);
  const baseRaw = await privateKeyToAccount(key).signTransaction({ ...tx, chainId: 84532 });
  const sentBefore = requests.filter(method => method === "eth_sendRawTransaction").length;
  await assert.rejects(chain.broadcast(baseRaw, keccak256(baseRaw)), /not signed for Ethereum Sepolia/);
  assert.equal(requests.filter(method => method === "eth_sendRawTransaction").length, sentBefore);
});

test("chain adapter fails closed on wrong chain, decimals, insufficient AUSD or gas", async () => {
  const { chain, state } = rpc();
  state.chainId = 1;
  await assert.rejects(chain.prepare(recipient), /Ethereum Sepolia/);
  state.chainId = 84532;
  await assert.rejects(chain.prepare(recipient), /Ethereum Sepolia/);
  state.chainId = 11155111; state.decimals = 18n;
  await assert.rejects(chain.prepare(recipient), /token or balance/);
  state.decimals = 6n; state.balance = 49_999_999n;
  await assert.rejects(chain.prepare(recipient), /token or balance/);
  state.balance = 50_000_000n; state.eth = 0n;
  await assert.rejects(chain.prepare(recipient), /test ETH/);
  assert.throws(() => createGrantChain({ ...config, treasury: recipient }, key), /does not match/);
});

test("only a safe canonical receipt with the exact AUSD transfer confirms a grant", async () => {
  const { chain, state } = rpc();
  assert.equal(await chain.inspect(txHash, recipient), "confirmed");
  state.safeNumber = 15;
  assert.equal(await chain.inspect(txHash, recipient), "pending");
  state.safeNumber = 16; state.canonicalHash = `0x${"cc".repeat(32)}`;
  assert.equal(await chain.inspect(txHash, recipient), "pending");
  state.canonicalHash = blockHash; state.logAmount = 49_000_000n;
  assert.equal(await chain.inspect(txHash, recipient), "invalid");
  state.logAmount = 50_000_000n; state.logTo = treasury;
  assert.equal(await chain.inspect(txHash, recipient), "invalid");
  state.logTo = recipient; state.logToken = treasury;
  assert.equal(await chain.inspect(txHash, recipient), "invalid");
  state.logToken = AUSD_ETHEREUM_SEPOLIA.tokenAddress; state.status = "0x0";
  assert.equal(await chain.inspect(txHash, recipient), "failed");
  state.receipt = false;
  assert.equal(await chain.inspect(txHash, recipient), "missing");
});
