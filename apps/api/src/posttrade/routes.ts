import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listingSchema, postTradeRoutes, resaleQuoteSchema, resaleSchema, type User } from "@impacks/contracts";
import { HttpError } from "../errors.js";
import type { PostTradeStore } from "./store.js";
import type { PackService } from "../services/packs.js";

export function registerPostTrade(app: FastifyInstance, store: PostTradeStore | undefined, user: (header?: string) => User, packs: PackService) {
  function context(header?: string) {
    const identity=user(header);
    if(!identity.id.startsWith("did:privy:")) throw new HttpError(403,"PRIVY_REQUIRED","Sign in with Privy to trade positions.");
    if(!store) throw new HttpError(503,"POSTTRADE_DISABLED","The paper marketplace is not enabled on this server.");
    return { owner:identity.id, ledger:store };
  }
  function key(value:unknown) { return z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/).parse(value); }
  app.get(postTradeRoutes.portfolio,async request=>{
    const {owner,ledger}=context(request.headers.authorization);
    for(const opening of packs.portfolio(owner)) ledger.importOpening(owner,opening);
    return ledger.portfolio(owner);
  });
  app.get(postTradeRoutes.listings,async request=>{
    const {owner,ledger}=context(request.headers.authorization); return {listings:ledger.listings(owner)};
  });
  app.post(postTradeRoutes.listings,async request=>{
    const {owner,ledger}=context(request.headers.authorization);
    return ledger.list(owner,listingSchema.parse(request.body),key(request.headers["idempotency-key"]));
  });
  app.post<{Params:{id:string}}>(`${postTradeRoutes.listings}/:id/cancel`,async request=>{
    const {owner,ledger}=context(request.headers.authorization);
    z.object({confirmSimulation:z.literal(true)}).strict().parse(request.body);
    return ledger.cancel(owner,z.string().uuid().parse(request.params.id));
  });
  app.post(postTradeRoutes.quotes,async request=>{
    const {owner,ledger}=context(request.headers.authorization);return ledger.quote(owner,resaleQuoteSchema.parse(request.body));
  });
  app.post(postTradeRoutes.trades,async request=>{
    const {owner,ledger}=context(request.headers.authorization),body=resaleSchema.parse(request.body);
    return ledger.buy(owner,body.quoteId,key(request.headers["idempotency-key"]));
  });
  app.get<{Params:{id:string}}>(`${postTradeRoutes.trades}/:id`,async request=>{
    const {owner,ledger}=context(request.headers.authorization);return ledger.trade(z.string().uuid().parse(request.params.id),owner);
  });
}
