"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DISCLOSURE_VERSION, type Opening, type Quote, type Session } from "@impacks/contracts";
import { api, ApiError } from "./api";

export const sessionKey = "impacks.demo.session";
export const attemptKey = "impacks.demo.attempt";

export type Attempt = { userId: string; quote: Quote; key: string };

export function readStored<T>(key: string): T | null {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
}

export function useDemoSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(sessionKey);
    sessionStorage.removeItem(attemptKey);
    setSession(null);
    setAttempt(null);
    setOpenings([]);
  }, []);

  const showError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) clearSession();
    setError(cause instanceof Error ? cause.message : "Something went wrong.");
  }, [clearSession]);

  useEffect(() => {
    setSession(readStored<Session>(sessionKey));
    setAttempt(readStored<Attempt>(attemptKey));
  }, []);

  useEffect(() => {
    if (session) void api.portfolio(session.token).then(result => setOpenings(result.openings)).catch(showError);
  }, [session, showError]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await api.login(name);
      sessionStorage.setItem(sessionKey, JSON.stringify(next));
      setSession(next);
    } catch (cause) { showError(cause); } finally { setBusy(false); }
  }

  async function logout() {
    if (!session) return;
    setBusy(true);
    try {
      await api.logout(session.token);
      clearSession();
      if (session.user.id.startsWith("did:privy:")) window.location.assign("/login?logout=1");
    } catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }

  async function openPack(packId: string, accepted: boolean, budgetCents: number) {
    if (!session || !accepted || busy) return;
    setBusy(true);
    setError("");
    try {
      const current = attempt?.userId === session.user.id
        && attempt.quote.pack.id === packId
        && attempt.quote.pack.budgetCents === budgetCents
        ? attempt
        : { userId: session.user.id, quote: await api.quote(session.token, packId, budgetCents), key: crypto.randomUUID() };
      setAttempt(current);
      sessionStorage.setItem(attemptKey, JSON.stringify(current));
      if (current.quote.payment.mode !== "demo") throw new Error("The wallet payment flow is not connected yet.");
      const result = await api.open(session.token, {
        quoteId: current.quote.id, disclosureVersion: DISCLOSURE_VERSION, paymentProof: `demo:${current.quote.id}`,
      }, current.key);
      setOpenings(previous => [result, ...previous.filter(o => o.id !== result.id)]);
      setAttempt(null);
      sessionStorage.removeItem(attemptKey);
      return result;
    } catch (cause) {
      if (cause instanceof ApiError && ["QUOTE_EXPIRED", "QUOTE_NOT_FOUND", "INSUFFICIENT_MARKETS"].includes(cause.code)) {
        setAttempt(null);
        sessionStorage.removeItem(attemptKey);
      }
      showError(cause);
    } finally { setBusy(false); }
  }

  return { session, name, setName, busy, error, openings, attempt, login, logout, openPack, showError };
}
