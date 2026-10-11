import { routes, type FulfillmentAttemptRequest, type ExecutionReport, type SandboxExecution, type AusdRefund } from "@impacks/contracts";

/** SERVER ONLY. Do not import into apps/web or expose the internal credential. No automatic retries. */
export function executionClient(origin: string, credential: string) {
  const base = new URL(origin);
  if (base.username || base.password || base.pathname !== "/" || base.search || base.hash ||
    (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))) {
    throw new Error("Use an HTTPS API origin (HTTP loopback is allowed for local development).");
  }
  async function request(purchaseId: string, action = "", body?: FulfillmentAttemptRequest | ExecutionReport | Record<string, never>): Promise<SandboxExecution> {
    const response = await fetch(`${base.origin}${routes.internalFulfillment}/${encodeURIComponent(purchaseId)}/execution${action}`, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`Internal execution request failed (${response.status}); retrieve the existing execution before retrying.`);
    return response.json() as Promise<SandboxExecution>;
  }
  async function refund(purchaseId: string, action = ""): Promise<AusdRefund> {
    const response = await fetch(`${base.origin}${routes.internalFulfillment}/${encodeURIComponent(purchaseId)}/refund${action}`, {
      method: action ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
      body: action ? "{}" : undefined,
    });
    if (!response.ok) throw new Error(`Internal refund request failed (${response.status}); no transfer is authorized.`);
    return response.json() as Promise<AusdRefund>;
  }
  return {
    refund: (purchaseId: string) => refund(purchaseId),
    prepareRefund: (purchaseId: string) => refund(purchaseId, "/prepare"),
    authorizeRefund: (purchaseId: string) => refund(purchaseId, "/authorize"),
    reconcileRefund: (purchaseId: string) => refund(purchaseId, "/reconcile"),
    get: (purchaseId: string) => request(purchaseId),
    reserve: (purchaseId: string, lease: FulfillmentAttemptRequest) => request(purchaseId, "/reserve", lease),
    prepare: (purchaseId: string, lease: FulfillmentAttemptRequest) => request(purchaseId, "/prepare", lease),
    report: (purchaseId: string, observation: ExecutionReport) => request(purchaseId, "/report", observation),
  };
}
