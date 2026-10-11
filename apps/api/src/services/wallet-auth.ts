import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { AUSD_BASE_SEPOLIA, type WalletChallenge, type WalletIdentity, type WalletSession, type WalletSignatureRequest } from "@impacks/contracts";
import { CheckoutStore } from "../storage/checkout.js";
import { HttpError } from "../errors.js";

const challengeMs = 5 * 60_000;
const sessionMs = 15 * 60_000;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
function unauthorized(): never { throw new HttpError(401, "WALLET_UNAUTHORIZED", "Authenticate with your wallet."); }

export class WalletAuthService {
  constructor(private readonly store: CheckoutStore, private readonly configuredOrigin: string | undefined) {}

  private origin(): URL {
    try {
      const url = new URL(this.configuredOrigin ?? "");
      if (url.origin !== this.configuredOrigin || url.username || url.password
        || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
      return url;
    } catch { throw new HttpError(503, "WALLET_AUTH_NOT_CONFIGURED", "Configure APP_ORIGIN as the exact application origin (HTTPS, or localhost HTTP)."); }
  }

  checkOrigin(origin: string | undefined, required = true): string {
    const expected = this.origin().origin;
    if ((required || origin !== undefined) && origin !== expected) {
      throw new HttpError(403, "ORIGIN_MISMATCH", "Request origin does not match the application.");
    }
    return expected;
  }

  challenge(walletAddress: string, origin: string | undefined): WalletChallenge {
    const expected = this.checkOrigin(origin);
    if (!isAddress(walletAddress)) throw new HttpError(400, "INVALID_REQUEST", "Invalid wallet checksum.");
    const wallet = getAddress(walletAddress);
    const issuedAt = new Date(Date.now()), expiresAt = new Date(Date.now() + challengeMs);
    const nonce = randomBytes(32).toString("hex"), challengeId = randomUUID();
    const domain = new URL(expected).host;
    const message = createSiweMessage({ domain, address: wallet, uri: expected,
      scheme: new URL(expected).protocol.slice(0, -1), version: "1", chainId: AUSD_BASE_SEPOLIA.chainId,
      nonce, issuedAt, expirationTime: expiresAt,
      statement: "Sign in to ImPacks. This signature does not authorize a payment.", requestId: challengeId });
    this.store.db.prepare(`INSERT INTO wallet_challenges (id, nonce, wallet, origin, message, issued_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(challengeId, nonce, wallet, expected, message, issuedAt.getTime(), expiresAt.getTime());
    return { challengeId, nonce, walletAddress: wallet, domain, origin: expected, message,
      chainId: AUSD_BASE_SEPOLIA.chainId, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString() };
  }

  async verify(input: WalletSignatureRequest, origin: string | undefined): Promise<WalletSession> {
    const expected = this.checkOrigin(origin);
    const row = this.store.db.prepare("SELECT * FROM wallet_challenges WHERE id = ?").get(input.challengeId);
    if (!row || row.consumed_at !== null || Number(row.expires_at) <= Date.now() || row.origin !== expected) unauthorized();
    let valid = false;
    try {
      // EOA EIP-191 verification of the stored message. Never accept a client message or nonce.
      valid = await verifyMessage({ address: row.wallet as Address, message: row.message as string, signature: input.signature as Hex });
    } catch { /* Malformed signatures are authentication failures, not server errors. */ }
    if (!valid) unauthorized();
    const token = randomBytes(32).toString("hex"), expiresAt = Date.now() + sessionMs;
    this.store.transaction(() => {
      const used = this.store.db.prepare(`UPDATE wallet_challenges SET consumed_at = ?
        WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND origin = ?`)
        .run(Date.now(), input.challengeId, Date.now(), expected);
      if (used.changes !== 1) unauthorized();
      this.store.db.prepare("INSERT INTO wallet_sessions (token_hash, wallet, origin, expires_at) VALUES (?, ?, ?, ?)")
        .run(digest(token), row.wallet as string, expected, expiresAt);
    });
    return { token, walletAddress: row.wallet as string, chainId: AUSD_BASE_SEPOLIA.chainId, expiresAt: new Date(expiresAt).toISOString() };
  }

  authenticate(authorization: string | undefined, origin: string | undefined, requireOrigin = false): WalletIdentity {
    const expected = this.checkOrigin(origin, requireOrigin);
    const token = authorization?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
    if (!token) unauthorized();
    const row = this.store.db.prepare("SELECT * FROM wallet_sessions WHERE token_hash = ?").get(digest(token));
    if (!row || row.revoked_at !== null || Number(row.expires_at) <= Date.now() || row.origin !== expected) unauthorized();
    return { walletAddress: row.wallet as string, chainId: AUSD_BASE_SEPOLIA.chainId, expiresAt: new Date(Number(row.expires_at)).toISOString() };
  }

  logout(authorization: string | undefined, origin: string | undefined) {
    this.authenticate(authorization, origin, true);
    this.store.db.prepare("UPDATE wallet_sessions SET revoked_at = ? WHERE token_hash = ?")
      .run(Date.now(), digest(authorization!.slice(7)));
  }
}
