import test from "node:test";
import assert from "node:assert/strict";
import { readAusdBalance } from "../src/services/wallet.js";
const address="0x1111111111111111111111111111111111111111";
function rpc(values: unknown): typeof fetch {return (async()=>Response.json(values)) as typeof fetch;}
const good=[{id:1,result:"0xaa36a7"},{id:2,result:"0x6"},{id:3,result:"0xe7fd02"}];
test("AUSD balance reads only the configured chain/token and preserves six-decimal precision",async()=>{
 let requests: {id:number;method:string;params:unknown[]}[]=[];
 const result=await readAusdBalance(address,(async(_url,init)=>{requests=JSON.parse(init!.body as string);return Response.json(good);}) as typeof fetch);
 assert.equal(result.balanceAtomic,"15203586");
 assert.equal(result.formatted,"15.203586");
 assert.equal(result.chainId,11155111);
 assert.equal(result.network,"Ethereum Sepolia");
 assert.deepEqual(requests.map(r=>r.method),["eth_chainId","eth_call","eth_call"]);
 assert.equal((requests[2].params[0] as {data:string}).data,`0x70a08231${address.slice(2).padStart(64,"0")}`);
 const zero=await readAusdBalance(address,rpc([...good.slice(0,2),{id:3,result:"0x0"}]));assert.equal(zero.formatted,"0");
});
test("AUSD reads reject invalid addresses, wrong chains, wrong decimals and failed RPCs without inventing a balance",async()=>{
 await assert.rejects(()=>readAusdBalance("not-an-address",rpc(good)),{code:"INVALID_ADDRESS"});
 await assert.rejects(()=>readAusdBalance(address,rpc([{id:1,result:"0x14a34"},...good.slice(1)])),{code:"BALANCE_UNAVAILABLE"});
 for(const values of [[{id:1,result:"0x1"},...good.slice(1)],[good[0],{id:2,result:"0x12"},good[2]],[...good.slice(0,2),{id:3,result:"0x"}],[...good.slice(0,2),{id:3,error:{message:"rate limited"}}]]) {
  await assert.rejects(()=>readAusdBalance(address,rpc(values)),{code:"BALANCE_UNAVAILABLE"});
 }
});
