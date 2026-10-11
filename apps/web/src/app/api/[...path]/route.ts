import { buildApp, injectRequest } from "@impacks/api/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One demo service per warm process. Hosted demo state is deliberately ephemeral.
// Real payment/order providers must use the durable, separately hosted API.
const demo = globalThis as typeof globalThis & { impacksDemo?: ReturnType<typeof buildApp> };

async function handle(request: Request) {
  const url = new URL(request.url);
  if (process.env.IMPACKS_EMBEDDED_DEMO !== "1") {
    const origin = (process.env.API_PROXY_TARGET || "http://127.0.0.1:3001").replace(/\/$/, "");
    const headers = new Headers(request.headers);
    headers.delete("host"); headers.delete("content-length");
    try {
      return await fetch(`${origin}${url.pathname}${url.search}`, {
        method: request.method, headers, cache: "no-store", redirect: "manual",
        body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      });
    } catch {
      return Response.json({ error: { code: "API_UNAVAILABLE", message: "The service is unavailable. Please try again shortly." } }, { status: 503 });
    }
  }

  demo.impacksDemo ??= buildApp({ mode: process.env.APP_MODE ?? "demo" });
  await demo.impacksDemo.ready();
  const payload = request.method === "POST" ? await request.text() : undefined;
  if (payload && Buffer.byteLength(payload) > 32_768) {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "Request body is too large." } }, { status: 413 });
  }
  const result = await injectRequest(demo.impacksDemo.routing, {
    method: request.method as "GET" | "POST", url: `${url.pathname}${url.search}`,
    headers: Object.fromEntries(request.headers), payload,
  });
  return new Response(result.statusCode === 204 ? null : result.body, {
    status: result.statusCode,
    headers: { "Content-Type": String(result.headers["content-type"] ?? "application/json"), "Cache-Control": "no-store" },
  });
}

export { handle as GET, handle as POST };
