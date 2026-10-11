import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { HttpError } from "./errors.js";
export function createPrivyVerifier(appId: string, key?: JWTVerifyGetKey) {
 const signingKey = key ?? createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`));
 return async (token: string) => {
   try {
     const { payload } = await jwtVerify(token, signingKey, {algorithms:["ES256"],issuer:"privy.io",audience:appId,requiredClaims:["sub","exp","iat"]});
     if (!payload.sub?.startsWith("did:privy:") || !payload.exp) throw new Error("Invalid identity");
     return { id: payload.sub, expiresAt: payload.exp * 1000 };
   } catch { throw new HttpError(401, "INVALID_PRIVY_TOKEN", "Your sign-in has expired or could not be verified. Please sign in again."); }
 };
}
