import type { Session } from "@impacks/contracts";
import { api, ApiError } from "./api";

type SessionApi = Pick<typeof api, "me" | "privyLogin">;

// A cached token is only reusable after the API confirms the current Privy identity.
export async function resolveAccountSession(userId: string, cached: Session | null, getAccessToken: () => Promise<string | null>, client: SessionApi = api): Promise<Session> {
  if (cached?.user?.id === userId && cached.token) {
    try {
      const verified = await client.me(cached.token);
      if (verified.user.id === userId) return { ...cached, user: verified.user };
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
    }
  }
  const token = await getAccessToken();
  if (!token) throw new Error("Your sign-in has expired. Sign in again to continue.");
  const session = await client.privyLogin(token);
  if (session.user.id !== userId) throw new Error("Your account changed. Reconnect before buying a pack.");
  return session;
}

export function postLoginPath(next: string | null): string {
  // Only return to pack routes; never allow an external redirect from a query string.
  if (!next || !/^\/(?:packs|category\/(?:crypto|sports|mixed))(?:\?[^#]*)?$/.test(next)) return "/packs";
  return next;
}
