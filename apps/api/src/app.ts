import { RefundService } from "./services/refunds.js";
import { configuredRefundVerifier } from "./providers/ausd/refund.js";
import { ExecutionService } from "./services/execution.js";
import { geminiProviders } from "./providers/gemini.js";
import { executionReportSchema } from "@impacks/contracts";
import type { MarketProvider } from "./providers/ports.js";
import Fastify from "fastify";
import { randomBytes, randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { checkoutParamsSchema, checkoutSchema, verifyCheckoutSchema, loginSchema, openSchema, quoteSchema, routes, type User } from "@impacks/contracts";
import { demoProviders, packs } from "./providers/demo.js";
import type { Providers } from "./providers/ports.js";
import { PackService } from "./services/packs.js";
import { HttpError } from "./errors.js";
import { CheckoutService } from "./services/checkout.js";
import { CheckoutStore, defaultCheckoutDatabasePath } from "./storage/checkout.js";
import { configuredPaymentVerifier, type PaymentVerifier } from "./providers/ausd/verify.js";
import type { Hash } from "viem";
import { emptyBodySchema, walletChallengeSchema, walletSignatureSchema, fulfillmentClaimSchema, fulfillmentAttemptSchema, fulfillmentCompleteSchema } from "@impacks/contracts";
import { WalletAuthService } from "./services/wallet-auth.js";
import { FulfillmentService, authorizeFulfillment } from "./services/fulfillment.js";

export function buildApp(options: { mode?: string; providers?: Providers; checkoutRecipientAddress?: string;
  checkoutDatabasePath?: string; paymentVerifier?: PaymentVerifier; appOrigin?: string; internalFulfillmentKey?: string; executionMarkets?: MarketProvider } = {}) {
  if ((options.mode ?? "demo") !== "demo") throw new Error("Only demo mode is wired. Implement verified identity, durable storage, AUSD and Gemini providers before enabling sandbox.");
  const app = Fastify({ bodyLimit: 32_768 });
  const sessions = new Map<string, { user: User; expiresAt: number }>();
  const service = new PackService(packs, options.providers ?? demoProviders());
  const databasePath = options.checkoutDatabasePath ?? process.env.AUSD_DATABASE_PATH ?? defaultCheckoutDatabasePath;
  if (databasePath === ":memory:" && options.checkoutDatabasePath !== ":memory:") {
    throw new Error("AUSD_DATABASE_PATH must point to durable storage. In-memory SQLite is for injected tests only.");
  }
  const checkoutStore = new CheckoutStore(databasePath);
  app.addHook("onClose", async () => checkoutStore.close());
  const checkout = new CheckoutService(options.checkoutRecipientAddress ?? process.env.AUSD_RECIPIENT_ADDRESS,
    checkoutStore, options.paymentVerifier ?? configuredPaymentVerifier());
  const walletAuth = new WalletAuthService(checkoutStore, options.appOrigin ?? process.env.APP_ORIGIN);
  const fulfillment = new FulfillmentService(checkoutStore);
  const refunds = new RefundService(checkoutStore, options.checkoutRecipientAddress ?? process.env.AUSD_RECIPIENT_ADDRESS, configuredRefundVerifier());
  const execution = new ExecutionService(checkoutStore, options.executionMarkets ?? geminiProviders().markets);
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith(routes.checkout)) reply.header("Cache-Control", "no-store");
  });
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
  app.get(routes.health, async () => ({ ok: true, mode: "demo", integrations: { auth: "simulated", payments: "simulated", markets: "fixtures", orders: "simulated", storage: "memory" } }));
  app.post(routes.login, async request => {
    const { displayName } = loginSchema.parse(request.body);
    const token = randomBytes(32).toString("hex");
    const identity = { id: randomUUID(), displayName };
    sessions.set(token, { user: identity, expiresAt: Date.now() + 24 * 60 * 60_000 });
    return { token, user: identity, mode: "demo" };
  });
  app.get(routes.me, async request => ({ user: user(request.headers.authorization), mode: "demo" }));
  app.post(routes.logout, async (request, reply) => {
    user(request.headers.authorization);
    sessions.delete(request.headers.authorization!.slice(7));
    return reply.code(204).send();
  });
  app.get(routes.packs, async () => ({ packs }));
  app.register(async walletRoutes => {
    walletRoutes.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "no-store"); });
    walletRoutes.post(routes.walletChallenge, async request => {
      const { walletAddress } = walletChallengeSchema.parse(request.body);
      return walletAuth.challenge(walletAddress, request.headers.origin);
    });
    walletRoutes.post(routes.walletVerify, async request => walletAuth.verify(walletSignatureSchema.parse(request.body), request.headers.origin));
    walletRoutes.get(routes.walletMe, async request => walletAuth.authenticate(request.headers.authorization, request.headers.origin));
    walletRoutes.post(routes.walletLogout, async (request, reply) => {
      emptyBodySchema.parse(request.body);
      walletAuth.logout(request.headers.authorization, request.headers.origin);
      return reply.code(204).send();
    });
  });
  app.post(routes.checkout, async (request, reply) => {
    const identity = walletAuth.authenticate(request.headers.authorization, request.headers.origin, true);
    const purchase = checkout.create(checkoutSchema.parse(request.body), identity.walletAddress);
    return reply.code(201).header("Cache-Control", "no-store")
      .header("Location", `${routes.checkout}/${purchase.purchaseId}`).send(purchase);
  });
  app.get(`${routes.checkout}/:purchaseId`, async (request, reply) => {
    const identity = walletAuth.authenticate(request.headers.authorization, request.headers.origin);
    const { purchaseId } = checkoutParamsSchema.parse(request.params);
    return reply.header("Cache-Control", "no-store").send(checkout.get(purchaseId, identity.walletAddress));
  });
  app.post(`${routes.checkout}/:purchaseId/verify`, async (request, reply) => {
    const identity = walletAuth.authenticate(request.headers.authorization, request.headers.origin, true);
    const { purchaseId } = checkoutParamsSchema.parse(request.params);
    const { transactionHash } = verifyCheckoutSchema.parse(request.body);
    reply.header("Cache-Control", "no-store");
    return checkout.verify(purchaseId, transactionHash as Hash, identity.walletAddress);
  });
  app.register(async internal => {
    internal.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      authorizeFulfillment(options.internalFulfillmentKey ?? process.env.INTERNAL_FULFILLMENT_KEY, request.headers.authorization, request.headers.origin);
    });
    const refundPath = `${routes.internalFulfillment}/:purchaseId/refund`;
    internal.get(refundPath, async request => refunds.get(checkoutParamsSchema.parse(request.params).purchaseId));
    internal.post(`${refundPath}/prepare`, async request => {
      emptyBodySchema.parse(request.body);
      return refunds.prepare(checkoutParamsSchema.parse(request.params).purchaseId);
    });
    internal.post(`${refundPath}/authorize`, async request => {
      emptyBodySchema.parse(request.body);
      return refunds.authorize(checkoutParamsSchema.parse(request.params).purchaseId);
    });
    internal.post(`${refundPath}/reconcile`, async request => {
      emptyBodySchema.parse(request.body);
      return refunds.reconcile(checkoutParamsSchema.parse(request.params).purchaseId);
    });
    const executionPath = `${routes.internalFulfillment}/:purchaseId/execution`;
    internal.get(executionPath, async request => execution.get(checkoutParamsSchema.parse(request.params).purchaseId));
    internal.post(`${executionPath}/reserve`, async request => execution.reserve(checkoutParamsSchema.parse(request.params).purchaseId, fulfillmentAttemptSchema.parse(request.body)));
    internal.post(`${executionPath}/prepare`, async request => execution.prepare(checkoutParamsSchema.parse(request.params).purchaseId, fulfillmentAttemptSchema.parse(request.body)));
    internal.post(`${executionPath}/report`, async request => execution.report(checkoutParamsSchema.parse(request.params).purchaseId, executionReportSchema.parse(request.body)));
    const path = `${routes.internalFulfillment}/:purchaseId/fulfillment`;
    internal.get(path, async request => fulfillment.get(checkoutParamsSchema.parse(request.params).purchaseId));
    internal.post(`${path}/claim`, async request => fulfillment.claim(checkoutParamsSchema.parse(request.params).purchaseId, fulfillmentClaimSchema.parse(request.body).requestId));
    internal.post(`${path}/renew`, async request => fulfillment.renew(checkoutParamsSchema.parse(request.params).purchaseId, fulfillmentAttemptSchema.parse(request.body)));
    internal.post(`${path}/complete`, async request => fulfillment.complete(checkoutParamsSchema.parse(request.params).purchaseId, fulfillmentCompleteSchema.parse(request.body)));
  });
  app.post(routes.quotes, async request => service.quote(user(request.headers.authorization).id, quoteSchema.parse(request.body).packId));
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
