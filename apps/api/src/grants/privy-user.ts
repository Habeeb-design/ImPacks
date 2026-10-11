import { z } from "zod";
import { isAddress } from "viem";

const linkedAccount = z.object({
  type: z.string(), address: z.string().optional(), chain_type: z.string().optional(),
  wallet_client_type: z.string().optional(), verified_at: z.number().nullable().optional(),
});
const privyUser = z.object({
  id: z.string(), created_at: z.number().int().positive(), is_guest: z.boolean(), linked_accounts: z.array(linkedAccount),
});
export type GrantIdentity = { createdAt: Date; verifiedEmail: boolean; recipient: `0x${string}` | null; guest: boolean };

export function createGrantUserLookup(appId: string, appSecret: string, request: typeof fetch = fetch) {
  return async (userId: string): Promise<GrantIdentity | null> => {
    const response = await request(`https://api.privy.io/v1/users/${encodeURIComponent(userId)}`, {
      headers: { "privy-app-id": appId, Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}` },
      signal: AbortSignal.timeout(8000), redirect: "error",
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Privy user lookup unavailable");
    const user = privyUser.parse(await response.json());
    if (user.id !== userId) throw new Error("Privy user identity mismatch");
    const wallets = user.linked_accounts.filter(a => a.type === "wallet" && a.chain_type === "ethereum"
      && a.wallet_client_type === "privy" && a.address && isAddress(a.address) && !/^0x0{40}$/i.test(a.address));
    // Multiple distinct embedded wallets require explicit policy rather than an arbitrary recipient.
    const addresses = [...new Set(wallets.map(w => w.address!.toLowerCase()))];
    return {
      createdAt: new Date(user.created_at * 1000), guest: user.is_guest,
      verifiedEmail: user.linked_accounts.some(a => a.type === "email" && !!a.verified_at),
      recipient: addresses.length === 1 ? addresses[0] as `0x${string}` : null,
    };
  };
}
