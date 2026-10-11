"use client";

import { useEffect, useRef, useState } from "react";
import { DISCLOSURE_VERSION, type CheckoutCapabilities, type CheckoutStatus, type Opening } from "@impacks/contracts";
import { api, ApiError } from "../lib/api";
import { checkoutAttemptKey, restoreCheckoutAttempt, type CheckoutAttempt } from "../lib/checkout";
import { useAccountWallet } from "./WalletProvider";
import { PredictionCard } from "./PredictionCard";
import { PackOpeningReveal } from "./PackOpeningReveal";
import styles from "./TestnetCheckout.module.css";

type Category = "crypto" | "sports" | "mixed";
const message = (error: unknown) => error instanceof Error ? error.message : "Unable to reach checkout. Retry the same purchase.";
const atomic = (amount: string) => `${BigInt(amount) / 1000000n}${BigInt(amount) % 1000000n ? `.${(BigInt(amount) % 1000000n).toString().padStart(6,"0").replace(/0+$/, "")}` : ""}`;

function useCapabilities() {
  const [capabilities, setCapabilities] = useState<CheckoutCapabilities | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void api.checkoutCapabilities().then(value => { if (active) { setCapabilities(value); setError(""); } }).catch(error => { if (active) setError(message(error)); });
    return () => { active = false; };
  }, [revision]);
  return { capabilities, error, retry: () => setRevision(value => value + 1) };
}

function PurchaseDetails({ value, onUpdate }: { value: CheckoutStatus; onUpdate: (value: CheckoutStatus) => void }) {
  const wallet = useAccountWallet();
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reveal, setReveal] = useState<Opening | null>(null);
  const inFlight = useRef(false);
  const owner = useRef(wallet.address); owner.current = wallet.address;
  const purchase = value.purchase;
  const id = purchase.purchaseId;
  const hashKey = `impacks.checkout-proof:${wallet.address?.toLowerCase()}:${id}`;
  useEffect(() => { try { setHash(sessionStorage.getItem(hashKey) ?? purchase.transactionHash ?? ""); } catch { setHash(purchase.transactionHash ?? ""); } }, [hashKey, purchase.transactionHash]);
  async function act(action: "refresh" | "verify" | "prepare") {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    const captured = owner.current;
    try {
      const token = await wallet.authorizeCheckout();
      if (owner.current !== captured) return;
      if (action === "verify") {
        if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Enter the transaction hash of the existing testnet payment.");
        sessionStorage.setItem(hashKey, hash);
        await api.verifyCheckout(token, id, { transactionHash: hash });
      }
      const next = action === "prepare" ? await api.prepareCheckout(token, id) : await api.checkoutStatus(token, id);
      if (owner.current === captured) onUpdate(next);
    } catch (cause) {
      if (owner.current === captured) { if (cause instanceof ApiError && cause.status === 401) wallet.invalidateCheckout(); setError(message(cause)); }
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <article className={styles.receipt}>
    <span className={styles.status}>{purchase.status === "confirmed" ? "Payment verified" : purchase.status === "expired" ? "Checkout expired" : "Awaiting payment evidence"}</span>
    <h3>{purchase.pack?.name ?? `${purchase.packType} testnet pack`}</h3>
    <dl><div><dt>Test AUSD</dt><dd>{purchase.amount}</dd></div><div><dt>Network</dt><dd>Ethereum Sepolia</dd></div><div><dt>Purchase</dt><dd>{id}</dd></div><div><dt>Expires</dt><dd>{new Date(purchase.expiresAt).toLocaleString()}</dd></div></dl>
    <p className={styles.note}>Receiving wallet: {purchase.recipientAddress}. This checkout does not move funds. Trading and refund transfers are not enabled.</p>
    {purchase.transactionHash && <a href={`https://sepolia.etherscan.io/tx/${purchase.transactionHash}`} target="_blank" rel="noreferrer">View verified payment ↗</a>}
    {purchase.status !== "confirmed" && <><label className={styles.hash}>Verify an existing testnet payment<input aria-label="Payment transaction hash" placeholder="0x…" value={hash} disabled={busy} onChange={event => setHash(event.target.value.trim())}/></label><p className={styles.note}>Pending confirmations can be retried with the same hash. Expired checkouts can still verify a payment mined before their deadline.</p></>}
    <div className={styles.actions}>
      {purchase.status !== "confirmed" && <button className="secondary" disabled={busy || !hash} onClick={() => void act("verify")}>Verify payment</button>}
      {purchase.status === "confirmed" && !value.execution?.preparedCards && <button className="secondary" disabled={busy} onClick={() => void act("prepare")}>Prepare predictions</button>}
      <button className="text-button" disabled={busy} onClick={() => void act("refresh")}>{busy ? "Checking…" : "Refresh status"}</button>
    </div>
    {value.execution && <p role="status">Predictions: {value.execution.state} · {value.execution.preparedCards} prepared · {value.execution.filledCards} filled. Prepared predictions are not holdings.</p>}
    {value.refund && <p>Remainder: {value.refund.state} · {atomic(value.refund.authorizedAtomic ?? value.refund.candidateAtomic)} test AUSD {value.refund.authorizedAtomic ? "authorized" : "estimated"}. Refund transfers remain disabled.{value.refund.transactionHash && <> <a href={`https://sepolia.etherscan.io/tx/${value.refund.transactionHash}`} target="_blank" rel="noreferrer">View refund ↗</a></>}</p>}
    {value.opening && <><div className={styles.cards}>{value.opening.cards.map(card => <PredictionCard key={card.id} card={card} mode="sandbox"/>)}</div><button className="secondary" onClick={() => setReveal(value.opening)}>Replay pack reveal</button><p className={styles.note}>These are reported sandbox results. Position selling is not enabled.</p></>}
    {reveal && <PackOpeningReveal opening={reveal} category={reveal.theme === "crypto" || reveal.theme === "sports" ? reveal.theme : "mixed"} onClose={() => setReveal(null)}/>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </article>;
}

export function TestnetCheckout({ packId, budgetCents, accepted }: { packId: Category; budgetCents: number | null; accepted: boolean }) {
  const wallet = useAccountWallet();
  const { capabilities, error: capabilityError, retry } = useCapabilities();
  const scope = `${wallet.userId}:${wallet.address?.toLowerCase()}:${packId}`;
  const identity = useRef(scope); identity.current = scope;
  const [state, setState] = useState<{ scope: string; attempt: CheckoutAttempt | null; status: CheckoutStatus | null } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false);
  const current = state?.scope === scope ? state : null;
  useEffect(() => {
    setError("");
    if (!wallet.address) { setState(null); return; }
    const key = checkoutAttemptKey(wallet.address, packId);
    let attempt: CheckoutAttempt | null = null;
    try { attempt = restoreCheckoutAttempt(sessionStorage.getItem(key), packId); } catch { /* storage unavailable */ }
    setState({ scope, attempt, status: null });
  }, [scope, wallet.address, packId]);
  async function prepare() {
    if (inFlight.current || !wallet.address || !budgetCents || (!accepted && !current?.attempt)) return;
    const captured = scope, address = wallet.address;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const token = await wallet.authorizeCheckout();
      if (identity.current !== captured) return;
      const key = checkoutAttemptKey(address, packId);
      const attempt = current?.attempt ?? { key: crypto.randomUUID(), body: { packType: "category" as const, packId, budgetCents, disclosureVersion: DISCLOSURE_VERSION } };
      // Persist the exact category/budget/key before the first request, including uncertain responses.
      sessionStorage.setItem(key, JSON.stringify(attempt));
      setState({ scope: captured, attempt, status: null });
      const purchase = attempt.purchaseId ? await api.checkout(token, attempt.purchaseId) : await api.createCheckout(token, attempt.body, attempt.key);
      const saved = { ...attempt, purchaseId: purchase.purchaseId };
      sessionStorage.setItem(key, JSON.stringify(saved));
      const status = await api.checkoutStatus(token, purchase.purchaseId);
      if (identity.current === captured) setState({ scope: captured, attempt: saved, status });
    } catch (cause) { if (identity.current === captured) { if (cause instanceof ApiError && cause.status === 401) wallet.invalidateCheckout(); setError(message(cause)); } }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className={styles.panel} aria-label="Testnet checkout">
    <p className="eyebrow">ETHEREUM SEPOLIA · TEST AUSD</p><h2>Your testnet checkout.</h2>
    <p>Connect your wallet to prepare a checkout for this edition and budget, verify an existing payment, and follow its predictions from your dashboard.</p>
    <p className={styles.note}>{capabilities?.reason ?? "Checking checkout availability…"}</p>
    {capabilityError && <p className={styles.error} role="alert">{capabilityError} <button className="text-button" onClick={retry}>Retry</button></p>}
    {!wallet.authenticated ? <a className="secondary" href={`/login?next=${encodeURIComponent(`/category/${packId}?amount=${(budgetCents ?? 2000) / 100}`)}`}>Sign in to prepare checkout</a>
      : <div className={styles.actions}><button className="secondary" disabled={!capabilities?.available || !wallet.address || !current || busy || wallet.checkoutConnecting || (!accepted && !current.attempt) || !budgetCents} onClick={() => void prepare()}>{busy || wallet.checkoutConnecting ? "Connecting checkout…" : current?.attempt ? "Resume saved checkout" : "Prepare testnet checkout"}</button><a href="/dashboard">Payment history ↗</a></div>}
    {current?.attempt && <p className={styles.note}>Saved checkout: {current.attempt.body.budgetCents! / 100} test AUSD. Retrying preserves this amount and purchase identity.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {current?.status && <PurchaseDetails key={`${scope}:${current.status.purchase.purchaseId}`} value={current.status} onUpdate={status => setState(value => value?.scope === scope ? { ...value, status } : value)}/>}
  </section>;
}

export function CheckoutHistory() {
  const wallet = useAccountWallet();
  const { capabilities, error: capabilityError, retry } = useCapabilities();
  const scope = `${wallet.userId}:${wallet.address?.toLowerCase()}`;
  const identity = useRef(scope); identity.current = scope;
  const [data, setData] = useState<{ scope: string; purchases: CheckoutStatus[] } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false);
  async function load() {
    if (inFlight.current) return;
    const captured = scope;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const token = await wallet.authorizeCheckout();
      if (identity.current !== captured) return;
      const result = await api.checkouts(token);
      if (identity.current === captured) setData({ scope: captured, purchases: result.purchases });
    } catch (cause) { if (identity.current === captured) { if (cause instanceof ApiError && cause.status === 401) wallet.invalidateCheckout(); setError(message(cause)); } }
    finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => { setError(""); }, [scope]);
  const purchases = data?.scope === scope ? data.purchases : null;
  return <section className={styles.panel} aria-label="Testnet purchase history"><p className="eyebrow">PAYMENTS & PREDICTIONS</p><h2>Testnet purchases.</h2>
    <p>Wallet-owned checkouts survive API restarts. Connect your wallet to see payment, prediction and remainder status.</p>
    <p className={styles.note}>{capabilities?.reason}</p>
    <button className="secondary" disabled={busy || wallet.checkoutConnecting || !wallet.address || !capabilities?.available} onClick={() => void load()}>{busy || wallet.checkoutConnecting ? "Connecting…" : purchases ? "Refresh purchases" : "Connect payment history"}</button>
    {(error || capabilityError) && <p className={styles.error} role="alert">{error || capabilityError} {capabilityError && <button className="text-button" onClick={retry}>Retry</button>}</p>}
    {purchases?.length === 0 && <p>No testnet purchases for this wallet yet. <a href="/packs">Explore editions ↗</a></p>}
    {purchases?.map(value => <PurchaseDetails key={`${scope}:${value.purchase.purchaseId}`} value={value} onUpdate={next => setData(current => current?.scope === scope ? { ...current, purchases: current.purchases.map(item => item.purchase.purchaseId === next.purchase.purchaseId ? next : item) } : current)}/>)}
  </section>;
}
