import test from "node:test";
import assert from "node:assert/strict";
import type { Session } from "@impacks/contracts";
import { resolveAccountSession, postLoginPath } from "../src/lib/account-session";
import { ApiError } from "../src/lib/api";

const collector = "did:privy:collector";
const saved: Session = {token:"saved-token", user:{id:collector, displayName:"Collector"}, mode:"demo"};
const refreshed: Session = {...saved, token:"refreshed-token"};

test("reuse a session only after the server confirms the signed-in account", async () => {
  const result = await resolveAccountSession(collector, saved, async()=>assert.fail("should not request a token"), {
    me:async token=>{assert.equal(token,saved.token);return {user:saved.user};},
    privyLogin:async()=>assert.fail("should not exchange"),
  });
  assert.deepEqual(result,saved);
});

test("restore expired local sessions through the existing Privy account", async () => {
  const result = await resolveAccountSession(collector,saved,async()=>"privy-access",{
    me:async()=>{throw new ApiError(401,"UNAUTHORIZED","Expired");},
    privyLogin:async token=>{assert.equal(token,"privy-access");return refreshed;},
  });
  assert.equal(result.token,refreshed.token);
});

test("a different cached account never supplies the purchase identity", async () => {
  const result = await resolveAccountSession(collector,{...saved,user:{id:"other-user",displayName:"Other"}},async()=>"current-access",{
    me:async()=>assert.fail("must not reuse another account"),
    privyLogin:async()=>refreshed,
  });
  assert.equal(result.user.id,collector);
});

test("reject mismatched identities and missing Privy access tokens", async () => {
  await assert.rejects(resolveAccountSession(collector,null,async()=>null),/expired/);
  await assert.rejects(resolveAccountSession(collector,null,async()=>"access",{
    me:async()=>({user:saved.user}),
    privyLogin:async()=>({...refreshed,user:{id:"other",displayName:"Other"}}),
  }),/account changed/);
});

test("network errors remain errors and do not create a substitute account", async () => {
  await assert.rejects(resolveAccountSession(collector,saved,async()=>assert.fail("no fallback"),{
    me:async()=>{throw new ApiError(503,"UNAVAILABLE","Offline");},
    privyLogin:async()=>assert.fail("no fallback"),
  }),/Offline/);
});

test("login returns to the selected pack and amount without external redirects", () => {
  assert.equal(postLoginPath("/category/crypto?amount=75"),"/category/crypto?amount=75");
  assert.equal(postLoginPath("/category/sports?amount=100"),"/category/sports?amount=100");
  for (const path of [null,"https://evil.example","//evil.example","/\\evil.example","javascript:alert(1)","/category/unknown","/login"]) {
    assert.equal(postLoginPath(path),"/packs");
  }
});
