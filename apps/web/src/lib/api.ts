import { routes, type ApiErrorBody, type Opening, type OpenRequest, type Pack, type Portfolio, type Quote, type Session, type WalletBalance } from "@impacks/contracts";
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
  closePosition: (token: string, openingId: string, cardId: string, key: string) => request<Opening>(`${routes.openings}/${encodeURIComponent(openingId)}/cards/${encodeURIComponent(cardId)}/close`, token, { confirmSimulation: true }, key),
  walletBalance: (address: string) => request<WalletBalance>(`${routes.wallets}/${encodeURIComponent(address)}/ausd`),
  privyLogin: (accessToken: string) => request<Session>(routes.privyLogin, accessToken, {}),
  login: (displayName: string) => request<Session>(routes.login, undefined, { displayName }),
  me: (token: string) => request<{ user: Session["user"] }>(routes.me, token),
  logout: (token: string) => request<void>(routes.logout, token, {}),
  packs: () => request<{ packs: Pack[] }>(routes.packs),
  quote: (token: string, packId: string, budgetCents?: number) => request<Quote>(routes.quotes, token, { packId, ...(budgetCents !== undefined ? { budgetCents } : {}) }),
  open: (token: string, body: OpenRequest, key: string) => request<Opening>(routes.openings, token, body, key),
  portfolio: (token: string) => request<Portfolio>(routes.portfolio, token),
};
