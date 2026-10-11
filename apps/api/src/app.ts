import Fastify from "fastify";
import { readAusdBalance } from "./services/wallet.js";
import { createPrivyVerifier } from "./privy.js";
import type { JWTVerifyGetKey } from "jose";
import { randomBytes, randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { loginSchema, openSchema, quoteSchema, routes, type User } from "@impacks/contracts";
import { demoProviders, packs } from "./providers/demo.js";
import type { Providers } from "./providers/ports.js";
import { PackService } from "./services/packs.js";
import { HttpError } from "./errors.js";
// Explicit CJS-compatible adapter for serverless hosts that cannot require ESM.
export { default as injectRequest } from "light-my-request";

export function buildApp(options: { mode?: string; providers?: Providers; privyAppId?: string; privyKey?: JWTVerifyGetKey } = {}) {
  if ((options.mode ?? "demo") !== "demo") throw new Error("Only demo mode is wired. Implement verified identity, durable storage, AUSD and Gemini providers before enabling sandbox.");
  const privyAppId = options.privyAppId ?? process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const verifyPrivy = privyAppId ? createPrivyVerifier(privyAppId, options.privyKey) : null;
  const app = Fastify({ bodyLimit: 32_768 });
  const sessions = new Map<string, { user: User; expiresAt: number }>();
  const service = new PackService(packs, options.providers ?? demoProviders());
  function user(authorization?: string): User {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(token);
      throw new HttpError(401, "UNAUTHORIZED", "Log in to continue.");
    }
    return session.user;
  }
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: "INVALID_REQUEST", message: error.issues.map(i => i.message).join("; ") } });
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    const candidate = error instanceof Error && "statusCode" in error ? error.statusCode : undefined;
    const status = typeof candidate === "number" && candidate >= 400 && candidate < 500 ? candidate : 500;
    return reply.code(status).send({ error: { code: status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST", message: status === 500 ? "Request failed. Retry with the same idempotency key." : "Invalid request." } });
  });
  app.get(routes.health, async () => ({ ok: true, mode: "demo", integrations: { auth: verifyPrivy ? "privy+demo" : "simulated", payments: "simulated", markets: "fixtures", orders: "simulated", storage: "memory" } }));
  app.post(routes.login, async request => {
    const { displayName } = loginSchema.parse(request.body);
    const token = randomBytes(32).toString("hex");
    const identity = { id: randomUUID(), displayName };
    sessions.set(token, { user: identity, expiresAt: Date.now() + 24 * 60 * 60_000 });
    return { token, user: identity, mode: "demo" };
  });
  app.post(routes.privyLogin, async request => {
    if (!verifyPrivy) throw new HttpError(503, "AUTH_UNAVAILABLE", "Sign-in is not available yet. Please try again shortly.");
    const accessToken = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : "";
    if (!accessToken) throw new HttpError(401, "UNAUTHORIZED", "Sign in to continue.");
    const verified = await verifyPrivy(accessToken);
    const token = randomBytes(32).toString("hex");
    const identity = { id: verified.id, displayName: "Collector" };
    sessions.set(token, { user: identity, expiresAt: verified.expiresAt });
    return { token, user: identity, mode: "demo" };
  });
  app.get(routes.me, async request => ({ user: user(request.headers.authorization), mode: "demo" }));
  app.post(routes.logout, async (request, reply) => {
    user(request.headers.authorization);
    sessions.delete(request.headers.authorization!.slice(7));
    return reply.code(204).send();
  });
  app.get<{Params:{address:string}}>(`${routes.wallets}/:address/ausd`, async request => readAusdBalance(request.params.address));
  app.get(routes.packs, async () => ({ packs }));
  app.post(routes.quotes, async request => {
    const body = quoteSchema.parse(request.body);
    return service.quote(user(request.headers.authorization).id, body.packId, body.budgetCents);
  });
  app.post(routes.openings, async request => {
    const identity = user(request.headers.authorization);
    const body = openSchema.parse(request.body);
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new HttpError(400, "INVALID_KEY", "Supply an Idempotency-Key of 8–128 letters, digits, hyphens or underscores.");
    return service.open(identity.id, body.quoteId, key, body.paymentProof);
  });
  app.get<{ Params: { id: string } }>(`${routes.openings}/:id`, async request => service.get(user(request.headers.authorization).id, request.params.id));
  app.get(routes.portfolio, async request => ({ openings: service.portfolio(user(request.headers.authorization).id) }));
  return app;
}
