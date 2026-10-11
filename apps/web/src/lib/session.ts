"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DISCLOSURE_VERSION, type Opening, type Quote, type Session } from "@impacks/contracts";
import { useAccountWallet } from "../components/WalletProvider";
import { resolveAccountSession } from "./account-session";
import { api, ApiError } from "./api";

export const sessionKey = "impacks.demo.session";
export const attemptKey = "impacks.demo.attempt";
export type Attempt = { userId: string; quote: Quote; key: string };
export function readStored<T>(key: string): T | null {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
}

export function usePackSession() {
  const wallet = useAccountWallet();
  const [session, setSession] = useState<Session | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const opening = useRef(false);
  const identity = useRef(wallet.userId);
  identity.current = wallet.userId;
  const retrySession = useCallback(() => setRevision(value => value + 1), []);
  const showError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) {
      sessionStorage.removeItem(sessionKey);
      setSession(null);
      setSessionError("Your connection expired. Reconnect your account to continue.");
    } else setError(cause instanceof Error ? cause.message : "Something went wrong.");
  }, []);

  useEffect(() => {
    let active = true;
    setSession(null); setOpenings([]); setError(""); setSessionError("");
    if (!wallet.configured) { setConnecting(false); return; }
    if (!wallet.authReady) { setConnecting(true); return; }
    if (!wallet.authenticated || !wallet.userId) {
      sessionStorage.removeItem(sessionKey); sessionStorage.removeItem(attemptKey);
      setAttempt(null); setConnecting(false); return;
    }
    const pending = readStored<Attempt>(attemptKey);
    setAttempt(pending?.userId === wallet.userId ? pending : null);
    if (pending && pending.userId !== wallet.userId) sessionStorage.removeItem(attemptKey);
    setConnecting(true);
    void resolveAccountSession(wallet.userId, readStored<Session>(sessionKey), wallet.getAccessToken)
      .then(next => {
        if (!active) return;
        sessionStorage.setItem(sessionKey, JSON.stringify(next)); setSession(next);
      })
      .catch(cause => { if (active) setSessionError(cause instanceof Error ? cause.message : "Could not connect your account."); })
      .finally(() => { if (active) setConnecting(false); });
    return () => { active = false; };
  }, [wallet.configured, wallet.authReady, wallet.authenticated, wallet.userId, wallet.getAccessToken, revision]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void api.portfolio(session.token).then(result => { if (active) setOpenings(previous => [...previous, ...result.openings.filter(item => !previous.some(existing => existing.id === item.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt))); }).catch(cause => { if (active) showError(cause); });
    return () => { active = false; };
  }, [session, showError]);

  async function openPack(packId: string, accepted: boolean, budgetCents: number) {
    if (!session || session.user.id !== wallet.userId || !accepted || opening.current) return;
    if (attempt && (attempt.quote.pack.id !== packId || attempt.quote.pack.budgetCents !== budgetCents)) {
      setError("Finish your pending opening before choosing another pack or amount."); return;
    }
    opening.current = true; setBusy(true); setError("");
    const owner = session.user.id;
    try {
      const current = attempt?.userId === owner ? attempt : {
        userId: owner, quote: await api.quote(session.token, packId, budgetCents), key: crypto.randomUUID(),
      };
      if (identity.current !== owner) return;
      setAttempt(current); sessionStorage.setItem(attemptKey, JSON.stringify(current));
      if (current.quote.payment.mode !== "demo") throw new Error("The wallet payment flow is not connected yet.");
      const result = await api.open(session.token, {
        quoteId: current.quote.id, disclosureVersion: DISCLOSURE_VERSION, paymentProof: `demo:${current.quote.id}`,
      }, current.key);
      if (identity.current !== owner) return;
      setOpenings(previous => [result, ...previous.filter(item => item.id !== result.id)]);
      setAttempt(null); sessionStorage.removeItem(attemptKey);
      return result;
    } catch (cause) {
      if (identity.current !== owner) return;
      if (cause instanceof ApiError && ["QUOTE_EXPIRED", "QUOTE_NOT_FOUND", "INSUFFICIENT_MARKETS"].includes(cause.code)) {
        setAttempt(null); sessionStorage.removeItem(attemptKey);
      }
      showError(cause);
    } finally { opening.current = false; setBusy(false); }
  }
  const currentAccount = wallet.authenticated && session?.user.id === wallet.userId;
  return { session: currentAccount ? session : null, connecting, sessionError, retrySession, busy, error,
    openings: currentAccount ? openings : [], attempt: attempt?.userId === wallet.userId ? attempt : null, openPack, showError };
}
