import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import { buildApp } from "../src/app.js";
import { routes } from "@impacks/contracts";

test("Privy exchange verifies signature, issuer, audience and expiry before issuing a demo session", async t => {
 const keys = await generateKeyPair("ES256");
 const otherKeys = await generateKeyPair("ES256");
 const app = buildApp({privyAppId:"test-app",privyKey:async () => keys.publicKey});
 t.after(() => app.close());
 async function sign({aud="test-app",issuer="privy.io",exp=Math.floor(Date.now()/1000)+3600,key=keys.privateKey} = {}) {
  return new SignJWT({}).setProtectedHeader({alg:"ES256"}).setSubject("did:privy:collector").setAudience(aud).setIssuer(issuer).setIssuedAt().setExpirationTime(exp).sign(key);
 }
 const exchange = (token: string) => app.inject({method:"POST",url:routes.privyLogin,headers:{authorization:`Bearer ${token}`},payload:{}});
 const ok = await exchange(await sign());
 assert.equal(ok.statusCode,200);
 assert.equal(ok.json().user.id,"did:privy:collector");
 assert.equal(ok.json().mode,"demo");
 assert.equal((await app.inject({url:routes.me,headers:{authorization:`Bearer ${ok.json().token}`}})).statusCode,200);
 for (const token of ["forged",await sign({aud:"wrong-app"}),await sign({issuer:"attacker"}),await sign({exp:1}),await sign({key:otherKeys.privateKey})]) {
  assert.equal((await exchange(token)).statusCode,401);
 }
 const again = await exchange(await sign());
 assert.equal(again.json().user.id,ok.json().user.id);
 assert.notEqual(again.json().token,ok.json().token);
});

test("Privy endpoint requires a bearer token",async t => {
 const keys = await generateKeyPair("ES256");
 const app = buildApp({privyAppId:"test-app",privyKey:async()=>keys.publicKey});
 t.after(()=>app.close());
 assert.equal((await app.inject({method:"POST",url:routes.privyLogin,payload:{}})).statusCode,401);
});
