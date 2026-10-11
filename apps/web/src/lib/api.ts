import { routes, type ApiErrorBody, type CheckoutPurchase, type CheckoutRequest, type VerifyCheckoutRequest, type Opening, type OpenRequest, type Pack, type Portfolio, type Quote, type Session, type WalletChallenge, type WalletSignatureRequest, type WalletSession, type WalletIdentity } from "@impacks/contracts";
const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
async function request<T>(path: string, token?: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(key ? { "Idempotency-Key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(response.status, data?.error?.code ?? "REQUEST_FAILED", data?.error?.message ?? "Unable to reach the API.");
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const api = {
  walletChallenge: (walletAddress: string) => request<WalletChallenge>(routes.walletChallenge, undefined, { walletAddress }),
  walletVerify: (body: WalletSignatureRequest) => request<WalletSession>(routes.walletVerify, undefined, body),
  walletMe: (token: string) => request<WalletIdentity>(routes.walletMe, token),
  walletLogout: (token: string) => request<void>(routes.walletLogout, token, {}),
  createCheckout: (token: string, body: CheckoutRequest) => request<CheckoutPurchase>(routes.checkout, token, body),
  checkout: (token: string, purchaseId: string) => request<CheckoutPurchase>(`${routes.checkout}/${encodeURIComponent(purchaseId)}`, token),
  verifyCheckout: (token: string, purchaseId: string, body: VerifyCheckoutRequest) => request<CheckoutPurchase>(`${routes.checkout}/${encodeURIComponent(purchaseId)}/verify`, token, body),
  login: (displayName: string) => request<Session>(routes.login, undefined, { displayName }),
  me: (token: string) => request<{ user: Session["user"] }>(routes.me, token),
  logout: (token: string) => request<void>(routes.logout, token, {}),
  packs: () => request<{ packs: Pack[] }>(routes.packs),
  quote: (token: string, packId: string) => request<Quote>(routes.quotes, token, { packId }),
  open: (token: string, body: OpenRequest, key: string) => request<Opening>(routes.openings, token, body, key),
  portfolio: (token: string) => request<Portfolio>(routes.portfolio, token),
};
