import { routes, type ApiErrorBody, type Opening, type OpenRequest, type Pack, type Portfolio, type Quote, type Session, type WalletBalance, type WelcomeGrant, type CheckoutPurchase, type CheckoutRequest, type VerifyCheckoutRequest, type WalletChallenge, type WalletSignatureRequest, type WalletSession, type WalletIdentity } from "@impacks/contracts";
const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
import type { MarketCategories, CheckoutCapabilities, CheckoutStatus } from "@impacks/contracts";
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
async function request<T>(path: string, token?: string, body?: unknown, key?: string, extraHeaders?: Record<string, string>): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...extraHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(key ? { "Idempotency-Key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(response.status, data?.error?.code ?? "REQUEST_FAILED", data?.error?.message ?? "Unable to reach the API.");
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const api = {
  startPurchase: (token: string, id: string, privyToken: string) => request<CheckoutStatus>(`${routes.checkout}/${encodeURIComponent(id)}/start`, token, {}, undefined, { "X-Privy-Token": privyToken }),
  paymentIntent: (token: string, id: string, privyToken: string) => request<import("@impacks/contracts").PaymentIntent>(`${routes.checkout}/${encodeURIComponent(id)}/payment-intent`, token, {}, undefined, { "X-Privy-Token": privyToken }),
  paymentRejected: (token: string, id: string, attemptId: string) => request<void>(`${routes.checkout}/${encodeURIComponent(id)}/payment-rejected`, token, { attemptId }),
  attachPayment: (token: string, id: string, transactionHash: string) => request<CheckoutStatus>(`${routes.checkout}/${encodeURIComponent(id)}/payment`, token, { transactionHash }),
  checkoutCapabilities: () => request<CheckoutCapabilities>(routes.checkoutCapabilities),
  checkouts: (token: string) => request<{ purchases: CheckoutStatus[] }>(routes.checkout, token),
  checkoutStatus: (token: string, id: string) => request<CheckoutStatus>(`${routes.checkout}/${encodeURIComponent(id)}/status`, token),
  prepareCheckout: (token: string, id: string) => request<CheckoutStatus>(`${routes.checkout}/${encodeURIComponent(id)}/prepare`, token, {}),
  marketCategories: () => request<MarketCategories>(routes.marketCategories),
  closePosition: (token: string, openingId: string, cardId: string, key: string) => request<Opening>(`${routes.openings}/${encodeURIComponent(openingId)}/cards/${encodeURIComponent(cardId)}/close`, token, { confirmSimulation: true }, key),
  welcomeGrant: (accessToken: string, enqueue = false) => request<WelcomeGrant>(routes.welcomeGrant, accessToken, enqueue ? {} : undefined),
  walletBalance: (address: string) => request<WalletBalance>(`${routes.wallets}/${encodeURIComponent(address)}/ausd`),
  privyLogin: (accessToken: string) => request<Session>(routes.privyLogin, accessToken, {}),
  walletChallenge: (walletAddress: string) => request<WalletChallenge>(routes.walletChallenge, undefined, { walletAddress }),
  walletVerify: (body: WalletSignatureRequest) => request<WalletSession>(routes.walletVerify, undefined, body),
  walletMe: (token: string) => request<WalletIdentity>(routes.walletMe, token),
  walletLogout: (token: string) => request<void>(routes.walletLogout, token, {}),
  createCheckout: (token: string, body: CheckoutRequest, key?: string) => request<CheckoutPurchase>(routes.checkout, token, body, key),
  checkout: (token: string, purchaseId: string) => request<CheckoutPurchase>(`${routes.checkout}/${encodeURIComponent(purchaseId)}`, token),
  verifyCheckout: (token: string, purchaseId: string, body: VerifyCheckoutRequest) => request<CheckoutPurchase>(`${routes.checkout}/${encodeURIComponent(purchaseId)}/verify`, token, body),
  login: (displayName: string) => request<Session>(routes.login, undefined, { displayName }),
  me: (token: string) => request<{ user: Session["user"] }>(routes.me, token),
  logout: (token: string) => request<void>(routes.logout, token, {}),
  packs: () => request<{ packs: Pack[] }>(routes.packs),
  quote: (token: string, packId: string, budgetCents?: number) => request<Quote>(routes.quotes, token, { packId, ...(budgetCents !== undefined ? { budgetCents } : {}) }),
  open: (token: string, body: OpenRequest, key: string) => request<Opening>(routes.openings, token, body, key),
  portfolio: (token: string) => request<Portfolio>(routes.portfolio, token),
};
