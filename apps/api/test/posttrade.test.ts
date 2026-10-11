import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import type { Opening } from "@impacks/contracts";
import { PostTradeStore } from "../src/posttrade/store.js";
import { createPostTradeStore } from "../src/posttrade/runtime.js";
import { buildApp } from "../src/app.js";

function opening(time=Date.now(),quantity=10):Opening {
 const id=randomUUID();return {id:randomUUID(),quoteId:randomUUID(),packName:"Paper pack",theme:"crypto",createdAt:new Date(time).toISOString(),status:"completed",payment:{status:"confirmed",reference:"demo-payment:test"},mode:"demo",cards:[{id,marketId:"demo-test",question:"A paper event?",side:"YES",allocationCents:500,priceCents:40,position:{status:"open"},order:{id:`demo-order:${id}`,status:"filled",quantity,spentCents:quantity*40}}]};
}
function setup(t:test.TestContext){
 let now=Date.now();const store=new PostTradeStore(":memory:",()=>now);t.after(()=>store.close());
 const source=opening(now);store.importOpening("seller",source);
 const position=store.portfolio("seller").positions[0];
 const list=(quantity=10,priceCents=60,key=randomUUID())=>store.list("seller",{positionId:position.id,quantity,priceCents,confirmSimulation:true},key);
 return {store,source,position,list,advance:(ms:number)=>{now+=ms;}};
}
test("only confirmed paper fills mint positions; source replay cannot remint or change ownership",t=>{
 const {store,source}=setup(t);store.importOpening("seller",source);
 assert.equal(store.portfolio("seller").positions.length,1);
 assert.throws(()=>store.importOpening("thief",source),{code:"FILL_CONFLICT"});
 for(const status of ["pending","unknown","failed"] as const){const item=opening();item.cards[0].order.status=status;store.importOpening("seller",item);}
 const sandbox=opening();sandbox.mode="sandbox";store.importOpening("seller",sandbox);
 const unpaid=opening();unpaid.payment.status="unknown";store.importOpening("seller",unpaid);
 assert.equal(store.portfolio("seller").positions.length,1);
 const changed=structuredClone(source);changed.cards[0].order.quantity++;assert.throws(()=>store.importOpening("seller",changed),{code:"FILL_CONFLICT"});
});
test("listings reserve quantity; cross-owner listing, overselling and negative quantities are rejected",t=>{
 const {store,position,list}=setup(t);const first=list(6);
 assert.equal(store.portfolio("seller").positions[0].availableQuantity,4);
 assert.throws(()=>list(5),{code:"QUANTITY_UNAVAILABLE"});
 assert.throws(()=>store.list("thief",{positionId:position.id,quantity:1,priceCents:50,confirmSimulation:true},randomUUID()),{code:"POSITION_NOT_FOUND"});
 assert.throws(()=>list(-1));assert.throws(()=>list(1,100));
 assert.throws(()=>store.cancel("thief",first.id),{code:"LISTING_NOT_FOUND"});
 store.cancel("seller",first.id);store.cancel("seller",first.id);
 assert.equal(store.portfolio("seller").positions[0].availableQuantity,10);
});
test("partial resale atomically moves quantity and payout rights, preserves basis and balances paper cash",t=>{
 const {store,source,list}=setup(t),listing=list(10),quote=store.quote("buyer",{listingId:listing.id,quantity:4});
 const trade=store.buy("buyer",quote.id,"purchase-key");
 assert.equal(trade.status,"completed");assert.equal(trade.payout,"not_redeemable");
 const seller=store.portfolio("seller"),buyer=store.portfolio("buyer");
 assert.deepEqual([seller.positions[0].remainingQuantity,seller.positions[0].listedQuantity,seller.positions[0].costBasisCents],[6,6,240]);
 assert.deepEqual([buyer.positions[0].remainingQuantity,buyer.positions[0].costBasisCents],[4,240]);
 assert.equal(seller.balanceCents+buyer.balanceCents,20000);assert.equal(seller.balanceCents,10240);assert.equal(buyer.balanceCents,9760);
 assert.equal(store.project("seller",source).cards[0].position?.remainingQuantity,6);
 assert.equal(store.project("seller",source).cards[0].order.quantity,10);
 assert.equal(store.portfolio("seller").trades[0].role,"seller");
 assert.throws(()=>store.trade(trade.id,"other"),{code:"TRADE_NOT_FOUND"});
 const resell=store.list("buyer",{positionId:buyer.positions[0].id,quantity:4,priceCents:70,confirmSimulation:true},randomUUID());
 const q2=store.quote("third",{listingId:resell.id,quantity:4});store.buy("third",q2.id,randomUUID());
 assert.equal(store.portfolio("buyer").positions.length,0);
 assert.equal(store.portfolio("third").positions[0].remainingQuantity+store.portfolio("seller").positions[0].remainingQuantity,10);
 const ledger=store.db.prepare("SELECT sum(amount) AS value FROM pt_cash_entries WHERE reference<>'paper-starter-credit'").get();assert.equal(ledger?.value,0);
});
test("retry identity survives expiry and prevents another listing or a second purchase",t=>{
 const {store,list,advance,position}=setup(t),listing=list(5,60,"listing-key");
 assert.equal(list(5,60,"listing-key").id,listing.id);
 assert.throws(()=>store.list("seller",{positionId:position.id,quantity:4,priceCents:60,confirmSimulation:true},"listing-key"),{code:"KEY_REUSED"});
 const quote=store.quote("buyer",{listingId:listing.id,quantity:5}),trade=store.buy("buyer",quote.id,"purchase-key");
 advance(60000);assert.deepEqual(store.buy("buyer",quote.id,"purchase-key"),trade);
 assert.throws(()=>store.buy("buyer",quote.id,"different-key"),{code:"QUOTE_USED"});
 assert.throws(()=>store.buy("buyer",randomUUID(),"purchase-key"),{code:"KEY_REUSED"});
 assert.equal(store.portfolio("buyer").positions[0].remainingQuantity,5);
});
test("quotes bind buyer, price and listing; self-trades, expiry and insufficient cash never transfer",t=>{
 const {store,list,advance}=setup(t),listing=list();
 assert.throws(()=>store.quote("seller",{listingId:listing.id,quantity:1}),{code:"SELF_TRADE"});
 const quote=store.quote("buyer",{listingId:listing.id,quantity:3});
 assert.throws(()=>store.buy("other",quote.id,randomUUID()),{code:"QUOTE_NOT_FOUND"});
 advance(30001);assert.throws(()=>store.buy("buyer",quote.id,randomUUID()),{code:"QUOTE_EXPIRED"});
 const fresh=store.quote("buyer",{listingId:listing.id,quantity:10});
 store.db.prepare("UPDATE pt_accounts SET balance=0 WHERE owner='buyer'").run();
 assert.throws(()=>store.buy("buyer",fresh.id,randomUUID()),{code:"INSUFFICIENT_BALANCE"});
 assert.equal(store.portfolio("seller").positions[0].remainingQuantity,10);
});
test("cancelled and expired listings release reservations and cannot fulfill stale quotes",t=>{
 const {store,list,advance}=setup(t),listing=list(5),quote=store.quote("buyer",{listingId:listing.id,quantity:5});
 store.cancel("seller",listing.id);assert.throws(()=>store.buy("buyer",quote.id,randomUUID()),{code:"QUANTITY_UNAVAILABLE"});
 list(10);advance(86400001);
 assert.equal(store.listings("buyer").length,0);assert.equal(store.portfolio("seller").positions[0].availableQuantity,10);
 assert.throws(()=>list(1),{code:"MARKET_CLOSED"});
});
test("full fill cannot be undone by cancellation or by replaying the original pack receipt",t=>{
 const {store,list,source}=setup(t),listing=list(),quote=store.quote("buyer",{listingId:listing.id,quantity:10});
 store.buy("buyer",quote.id,randomUUID());store.cancel("seller",listing.id);store.importOpening("seller",source);
 assert.equal(store.portfolio("seller").positions.length,0);assert.equal(store.portfolio("buyer").positions[0].remainingQuantity,10);
 assert.equal(store.project("seller",source).cards[0].position?.status,"closed");
});
test("independent SQLite connections cannot buy the same quantity twice; records and retries survive restart",t=>{
 const dir=mkdtempSync(join(tmpdir(),"impacks-posttrade-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,"ledger.sqlite");
 let a=new PostTradeStore(path);const source=opening();a.importOpening("seller",source);const position=a.portfolio("seller").positions[0];
 const listing=a.list("seller",{positionId:position.id,quantity:10,priceCents:60,confirmSimulation:true},"listing-key");
 const qa=a.quote("a",{listingId:listing.id,quantity:10});const b=new PostTradeStore(path);const qb=b.quote("b",{listingId:listing.id,quantity:10});
 const trade=a.buy("a",qa.id,"purchase-key");assert.throws(()=>b.buy("b",qb.id,randomUUID()),{code:"QUANTITY_UNAVAILABLE"});b.close();a.close();
 a=new PostTradeStore(path);try{a.importOpening("seller",source);assert.deepEqual(a.buy("a",qa.id,"purchase-key"),trade);assert.equal(a.portfolio("a").balanceCents,9400);assert.equal(a.portfolio("seller").positions.length,0);}finally{a.close();}
});
test("a database failure rolls back cash, quantities, reservations and trade intent together",t=>{
 const {store,list}=setup(t),listing=list(),quote=store.quote("buyer",{listingId:listing.id,quantity:3});
 store.db.exec("CREATE TRIGGER fail_trade BEFORE INSERT ON pt_trades BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
 assert.throws(()=>store.buy("buyer",quote.id,"purchase-key"),/injected failure/);
 assert.equal(store.portfolio("seller").positions[0].remainingQuantity,10);assert.equal(store.portfolio("buyer").balanceCents,10000);
 assert.equal(store.portfolio("buyer").positions.length,0);assert.equal(store.portfolio("seller").trades.length,0);
 store.db.exec("DROP TRIGGER fail_trade");assert.equal(store.buy("buyer",quote.id,"purchase-key").quantity,3);
});
test("post-trade runtime is opt-in and rejects ephemeral storage",()=>{
 assert.equal(createPostTradeStore({}),undefined);
 assert.throws(()=>createPostTradeStore({POSTTRADE_DEMO_ENABLED:"1",VERCEL:"1"}),/standalone/);
 assert.throws(()=>createPostTradeStore({POSTTRADE_DEMO_ENABLED:"1",POSTTRADE_DB_PATH:":memory:"}),/durable/);
});
test("authenticated API connects opening to listing to resale, isolates accounts and blocks legacy double-close",async t=>{
 const ledger=new PostTradeStore(":memory:");t.after(()=>ledger.close());const {privateKey,publicKey}=await generateKeyPair("ES256");
 const app=buildApp({postTrade:ledger,privyAppId:"app",privyKey:async()=>publicKey});t.after(()=>app.close());
 async function login(id:string){const jwt=await new SignJWT({}).setProtectedHeader({alg:"ES256"}).setIssuer("privy.io").setAudience("app").setSubject(`did:privy:${id}`).setIssuedAt().setExpirationTime("1h").sign(privateKey);
 return (await app.inject({method:"POST",url:"/api/auth/privy",headers:{authorization:`Bearer ${jwt}`}})).json().token;}
 const seller=await login("seller"),buyer=await login("buyer"),auth=(token:string,key?:string)=>({authorization:`Bearer ${token}`,...(key?{"idempotency-key":key}:{})});
 assert.equal((await app.inject({url:"/api/posttrade/portfolio"})).statusCode,401);
 const guest=(await app.inject({method:"POST",url:"/api/auth/demo",payload:{displayName:"Guest"}})).json();
 assert.equal((await app.inject({url:"/api/posttrade/portfolio",headers:auth(guest.token)})).statusCode,403);
 const quote=(await app.inject({method:"POST",url:"/api/quotes",headers:auth(seller),payload:{packId:"crypto"}})).json();
 const opened=await app.inject({method:"POST",url:"/api/openings",headers:auth(seller,"opening-key"),payload:{quoteId:quote.id,disclosureVersion:"random-v1",paymentProof:`demo:${quote.id}`}});assert.equal(opened.statusCode,200);
 const portfolio=(await app.inject({url:"/api/posttrade/portfolio",headers:auth(seller)})).json();assert.equal(portfolio.positions.length,3);
 const position=portfolio.positions[0];
 const response=await app.inject({method:"POST",url:"/api/posttrade/listings",headers:auth(seller,"listing-key"),payload:{positionId:position.id,quantity:1,priceCents:50,confirmSimulation:true}});assert.equal(response.statusCode,200);
 const purchaseQuote=(await app.inject({method:"POST",url:"/api/posttrade/quotes",headers:auth(buyer),payload:{listingId:response.json().id,quantity:1}})).json();
 const [one,two]=await Promise.all([1,2].map(()=>app.inject({method:"POST",url:"/api/posttrade/trades",headers:auth(buyer,"purchase-key"),payload:{quoteId:purchaseQuote.id,confirmSimulation:true}})));
 assert.equal(one.statusCode,200);assert.equal(one.json().id,two.json().id);
 const card=opened.json().cards.find((c:any)=>c.id===position.sourceCardId);
 assert.equal((await app.inject({method:"POST",url:`/api/openings/${opened.json().id}/cards/${card.id}/close`,headers:auth(seller,"close-key"),payload:{confirmSimulation:true}})).statusCode,409);
 assert.equal((await app.inject({method:"POST",url:"/api/posttrade/trades",headers:auth(buyer,"extra-key"),payload:{quoteId:purchaseQuote.id,confirmSimulation:true,recipient:"attacker"}})).statusCode,400);
 const ownerView=(await app.inject({url:"/api/portfolio",headers:auth(seller)})).json().openings[0];
 assert.equal(ownerView.cards.find((c:any)=>c.id===card.id).position.remainingQuantity,card.order.quantity-1);
});
