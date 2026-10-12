import test from "node:test";
import assert from "node:assert/strict";
import type { Card } from "@impacks/contracts";
import { cardBrand, cardHolding, cardRarity, cardTitle, rarities } from "../src/lib/card-presentation";
const card: Card = {id:"a",marketId:"btc",question:"Will Bitcoin rise?",side:"YES",allocationCents:500,priceCents:50,order:{id:"x",status:"filled",quantity:8,spentCents:400}};
test("precise local branding and honest unsupported-asset fallback",()=>{
 assert.equal(cardBrand("Will Bitcoin rise?").src,"/images/brands/btc.svg");
 assert.equal(cardBrand("Will ETH rise?").src,"/images/brands/eth.svg");
 assert.equal(cardBrand("Will Solana rise?").name,"Solana");
 assert.equal(cardBrand("Will Solana rise?").src,null);
 assert.equal(cardBrand("Will WNBA expand?").name,"WNBA");
 assert.equal(cardBrand("Will Bitcoin outperform Ethereum?", "crypto").src,null);
 assert.equal(cardBrand("Will UnknownCo IPO?", "business").src,null);
 assert.equal(cardBrand(undefined, "unsupported").name,"Prediction");
 assert.equal(cardBrand("Will the shell break?").src,null);
});
test("cosmetic finishes are stable for YES/NO and cover all four styles",()=>{
 const found=new Set();
 for(let i=0;i<100;i++)for(const side of ["YES","NO"] as const){const c={...card,marketId:String(i),side};found.add(cardRarity(c));assert.equal(cardRarity(c),cardRarity({...c,order:{...c.order,quantity:1}}));}
 assert.deepEqual([...found].sort(),[...rarities].sort());
});
test("pending and unknown orders never fabricate payout; partial ownership uses remaining quantity",()=>{
 assert.equal(cardHolding(card).quantity,8);
 for(const status of ["pending","unknown","failed"] as const)assert.equal(cardHolding({...card,order:{...card.order,status}}).quantity,null);
 assert.equal(cardHolding({...card,position:{status:"open",remainingQuantity:3}}).quantity,3);
 assert.equal(cardHolding({...card,position:{status:"closed"}}).quantity,0);
 assert.equal(cardHolding({...card,order:undefined} as unknown as Card).spent,null);
});
test("short display titles retain original question without fabricated claims",()=>{
 assert.equal(cardTitle(undefined),"Market details unavailable");assert.equal(cardTitle(card.question),card.question);
 const question="Will "+"long market description ".repeat(8);assert.ok(cardTitle(question).length<=70);assert.ok(question.startsWith(cardTitle(question).slice(0,-1)));
});
