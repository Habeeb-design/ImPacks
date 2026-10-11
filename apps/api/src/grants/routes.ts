import type { FastifyInstance } from "fastify";
import { Webhook } from "svix";
import { z } from "zod";
import { routes } from "@impacks/contracts";
import { HttpError } from "../errors.js";
import { grantDto, type GrantStore } from "./store.js";

export interface GrantApi { store: GrantStore; webhookSecret: string }
const subject = z.string().startsWith("did:privy:").max(200);

export function registerGrantRoutes(app: FastifyInstance, grants: GrantApi | undefined,
  verify: ((token: string) => Promise<{ id: string }>) | null) {
  async function user(authorization?: string) {
    if (!verify) throw new HttpError(503, "AUTH_UNAVAILABLE", "Sign-in is unavailable.");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) throw new HttpError(401, "UNAUTHORIZED", "Sign in to check your welcome AUSD.");
    return subject.parse((await verify(token)).id);
  }
  app.post(routes.welcomeGrant, async request => {
    const id = await user(request.headers.authorization);
    z.object({}).strict().parse(request.body ?? {});
    return grants ? grantDto(await grants.store.enqueue(id)) : grantDto(null, false);
  });
  app.get(routes.welcomeGrant, async request => {
    const id = await user(request.headers.authorization);
    return grants ? grantDto(await grants.store.get(id)) : grantDto(null, false);
  });
  app.register(async scoped => {
    // Svix signs the exact request bytes. Keep this parser scoped to the webhook.
    scoped.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => done(null, body));
    scoped.post(routes.privyWebhook, { bodyLimit: 262144 }, async (request, reply) => {
      if (!grants) throw new HttpError(503, "GRANTS_DISABLED", "Welcome grants are not enabled.");
      let payload: unknown;
      try {
        const headers: Record<string, string> = {};
        for (const name of ["svix-id", "svix-timestamp", "svix-signature"]) {
          const value = request.headers[name];
          if (typeof value !== "string") throw new Error("Missing signature");
          headers[name] = value;
        }
        const raw = request.body as string;
        new Webhook(grants.webhookSecret).verify(raw, headers);
        payload = JSON.parse(raw);
      } catch { throw new HttpError(401, "INVALID_WEBHOOK", "Webhook signature could not be verified."); }
      const event = z.object({ type: z.string(), user: z.object({ id: subject }).optional() }).parse(payload);
      if (event.type === "user.created" || event.type === "user.wallet_created") {
        if (!event.user) throw new HttpError(400, "INVALID_WEBHOOK", "User identity is missing.");
        // Only enqueue the DID. Never trust a webhook/browser to choose amount or payee.
        await grants.store.enqueue(event.user.id);
      }
      return reply.code(204).send();
    });
  });
}
