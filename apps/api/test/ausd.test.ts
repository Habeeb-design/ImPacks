import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { AUSD_BASE_SEPOLIA } from "@impacks/contracts";
import { readAusdConfig, verifyAusdConnectivity } from "../src/providers/ausd/index.js";

const env = { AUSD_RPC_URL: "https://example.test", AUSD_CONTRACT_ADDRESS: AUSD_BASE_SEPOLIA.tokenAddress };

test("AUSD configuration rejects missing RPC, wrong token, and invalid recipient", () => {
  assert.throws(() => readAusdConfig({}), /AUSD_RPC_URL/);
  assert.throws(() => readAusdConfig({ ...env, AUSD_RPC_URL: "file:///tmp/rpc" }), /HTTP/);
  assert.throws(() => readAusdConfig({ ...env, AUSD_CONTRACT_ADDRESS: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" }), /official/);
  for (const recipient of ["invalid", "0x0000000000000000000000000000000000000000"]) {
    assert.throws(() => readAusdConfig({ ...env, AUSD_RECIPIENT_ADDRESS: recipient }), /nonzero/);
  }
  assert.equal(readAusdConfig(env).recipientAddress, null);
});

// Local JSON-RPC fixtures exercise viem's actual HTTP transport and ABI decoding.
// These tests are deterministic; only check:ausd provides live connectivity evidence.
for (const scenario of ["success", "wrong chain", "missing code", "wrong decimals", "RPC error"] as const) {
  test(`AUSD connectivity: ${scenario}`, async t => {
    const methods: string[] = [];
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const rpc = JSON.parse(body);
      methods.push(rpc.method);
      const results: Record<string, string> = {
        eth_chainId: scenario === "wrong chain" ? "0x2105" : "0x14a34",
        eth_blockNumber: "0x1234",
        eth_getCode: scenario === "missing code" ? "0x" : "0x6000",
        eth_call: `0x${(scenario === "wrong decimals" ? 18 : 6).toString(16).padStart(64, "0")}`,
      };
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id,
        ...(scenario === "RPC error" ? { error: { code: -32602, message: "fixture failure" } } : { result: results[rpc.method] }),
      }));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const config = readAusdConfig({ ...env, AUSD_RPC_URL: `http://127.0.0.1:${address.port}` });
    if (scenario === "success") {
      const result = await verifyAusdConnectivity(config);
      assert.equal(result.chainId, 84532);
      assert.equal(result.decimals, 6);
      assert.equal(result.blockNumber, "4660");
      assert.equal(result.recipientConfigured, false);
      assert.deepEqual(methods, ["eth_chainId", "eth_blockNumber", "eth_getCode", "eth_call"]);
    } else {
      const expected = { "wrong chain": /Base Sepolia/, "missing code": /bytecode/, "wrong decimals": /decimals/, "RPC error": /fixture failure/ };
      await assert.rejects(verifyAusdConnectivity(config), expected[scenario]);
      if (scenario === "wrong chain") assert.deepEqual(methods, ["eth_chainId"]);
    }
  });
}
