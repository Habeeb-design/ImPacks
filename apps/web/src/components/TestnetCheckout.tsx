"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { paymentProofKey } from "../lib/payment";
import { DISCLOSURE_VERSION, type CheckoutCapabilities, type CheckoutStatus, type Opening, type PipelineStatus } from "@impacks/contracts";
import { api, ApiError } from "../lib/api";
import { checkoutAttemptKey, restoreCheckoutAttempt, type CheckoutAttempt } from "../lib/checkout";
import { useAccountWallet } from "./WalletProvider";
import { PredictionCard } from "./PredictionCard";
import { PackOpeningReveal } from "./PackOpeningReveal";
import styles from "./TestnetCheckout.module.css";
import type { CategoryId } from "../lib/category";
import { purchaseProgress } from "../lib/purchase-progress";

type Category = CategoryId;
const message = (error: unknown) => error instanceof Error ? error.message : "Unable to reach checkout. Retry the same purchase.";
const atomic = (amount: string) => `${BigInt(amount) / 1000000n}${BigInt(amount) % 1000000n ? `.${(BigInt(amount) % 1000000n).toString().padStart(6,"0").replace(/0+$/, "")}` : ""}`;

export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<CheckoutCapabilities | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => { setLoading(true); setError(""); setRevision(value => value + 1); }, []);
  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const current = ++request;
      void api.checkoutCapabilities().then(value => { if (active && current === request) { setCapabilities(value); setError(""); } })
        .catch(error => { if (active && current === request) setError(message(error)); })
        .finally(() => { if (active && current === request) setLoading(false); });
    };
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => { active = false; clearInterval(timer); };
  }, [revision]);
  return { capabilities, error, loading, retry };
}

async function pay(wallet: ReturnType<typeof useAccountWallet>, purchaseId: string, token: string, isCurrent: () => boolean) {
  const access = await wallet.getAccessToken();
  if (!isCurrent()) throw new Error("Account changed. Resume with the original wallet.");
  if (!access || !wallet.address) throw new Error("Reconnect your account before payment.");
  const address = wallet.address;
  const proofKey = paymentProofKey(address, purchaseId);
  const saved = sessionStorage.getItem(proofKey);
  if (saved) return api.attachPayment(token, purchaseId, saved);
  // Verify storage before asking the wallet. The server separately grants one payment request.
  sessionStorage.setItem(`${proofKey}:requested`, "1");
  const intent = await api.paymentIntent(token, purchaseId, access);
  if (!isCurrent()) throw new Error("Account changed before wallet confirmation. Resume the original purchase.");
  let hash: string;
  try { hash = await wallet.sendCheckoutPayment(intent.purchase); }
  catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === 4001) {
      await api.paymentRejected(token, purchaseId, intent.attemptId);
      sessionStorage.removeItem(`${proofKey}:requested`);
    }
    throw cause;
  }
  // Keep the returned hash visible even if storage or the API fails after wallet submission.
  try { sessionStorage.setItem(proofKey, hash); }
  catch { throw new Error(`Payment submitted: ${hash}. Save this hash and use Verify payment; do not pay again.`); }
  return api.attachPayment(token, purchaseId, hash);
}

const purchaseMessages: Record<PipelineStatus["state"], string> = {
  "awaiting-payment": "Waiting for your payment confirmation.",
  preparing: "Payment received. Preparing your predictions…",
  executing: "Buying your predictions…",
  "reconciliation-required": "Your purchase is taking longer than usual. We’re checking its status. Do not pay again.",
  settled: "Your purchase results are ready.",
  refunding: "Returning your unused AUSD…",
  completed: "Your purchase is complete.",
};

function PurchaseDetails({ value, onUpdate, checkoutBusy = false }: { value: CheckoutStatus; onUpdate: (value: CheckoutStatus) => void; checkoutBusy?: boolean }) {
  const wallet = useAccountWallet();
  const [hash, setHash] = useState("");
  const [acting, setBusy] = useState(false), [error, setError] = useState("");
  const busy = acting || checkoutBusy;
  const [reveal, setReveal] = useState<Opening | null>(null);
  const inFlight = useRef(false);
  const owner = useRef(`${wallet.userId}:${wallet.address}`); owner.current = `${wallet.userId}:${wallet.address}`;
  const purchase = value.purchase;
  const id = purchase.purchaseId;
  const hashKey = paymentProofKey(wallet.address ?? "", id);
  useEffect(() => { try { setHash(sessionStorage.getItem(hashKey) ?? purchase.transactionHash ?? ""); } catch { setHash(purchase.transactionHash ?? ""); } }, [hashKey, purchase.transactionHash]);
  async function act(action: "refresh" | "verify" | "pay") {
    if (inFlight.current || checkoutBusy) return;
    inFlight.current = true; setBusy(true); setError("");
    const captured = owner.current;
    try {
      const token = await wallet.authorizeCheckout();
      if (owner.current !== captured) return;
      if (action === "verify") {
        if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Enter the transaction hash of the existing testnet payment.");
        sessionStorage.setItem(hashKey, hash);
        if (value.pipeline) await api.attachPayment(token, id, hash);
        else await api.verifyCheckout(token, id, { transactionHash: hash });
      }
      if (action === "pay") await pay(wallet, id, token, () => owner.current === captured);
      const next = await api.checkoutStatus(token, id);
      if (owner.current === captured) onUpdate(next);
    } catch (cause) {
      if (owner.current === captured) { if (cause instanceof ApiError && cause.status === 401) wallet.invalidateCheckout(); setError(message(cause)); }
    } finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!value.pipeline || value.pipeline.state === "completed" || !wallet.checkoutToken) return;
    let active = true;
    const captured = owner.current, token = wallet.checkoutToken;
    const timer = setInterval(() => {
      if (inFlight.current) return;
      void (async () => {
        const saved = sessionStorage.getItem(hashKey);
        if (saved && !value.pipeline?.paymentHash) await api.attachPayment(token, id, saved);
        const next = await api.checkoutStatus(token, id);
        if (active && owner.current === captured) onUpdate(next);
      })().catch(cause => { if (active) setError(message(cause)); });
    }, value.pipeline.fundingMode === "platform-advance" && !value.opening ? 1000 : 5000);
    return () => { active = false; clearInterval(timer); };
  }, [id, value.pipeline?.state, value.pipeline?.paymentHash, value.pipeline?.fundingMode, !!value.opening, wallet.checkoutToken, hashKey, onUpdate]);
  useEffect(() => {
    if (value.pipeline && (value.pipeline.fundingMode === "platform-advance" || ["settled", "refunding", "completed"].includes(value.pipeline.state)) && value.opening) {
      const key = `impacks.revealed:${wallet.address?.toLowerCase()}:${id}`;
      try { if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, "1"); setReveal(value.opening); } } catch { /* Replay remains available. */ }
    }
  }, [id, value.pipeline?.state, value.opening, wallet.address]);
  return <article className={styles.receipt}>
    <span className={styles.status}>{value.pipeline?.state === "reconciliation-required" ? "Checking order status" : purchase.status === "confirmed" ? "Payment received" : purchase.status === "expired" ? "Checkout expired" : value.pipeline?.fundingMode === "platform-advance" ? value.opening ? "Ready · payment due" : "Opening your pack" : "Awaiting payment"}</span>
    <h3>{purchase.pack?.name ?? `${purchase.packType} pack`}</h3>
    <p>{purchase.amount} test AUSD · Ethereum Sepolia</p>
    {value.pipeline && <p role="status">{value.pipeline.fundingMode === "platform-advance" && purchase.status !== "confirmed" && value.pipeline.state !== "reconciliation-required" ? value.pipeline.paymentHash ? "Your payment was submitted. Waiting for confirmation." : value.opening ? "Your pack results are ready. Complete your AUSD payment below." : "Opening your pack now. Payment comes after the reveal." : purchaseMessages[value.pipeline.state]}{value.pipeline.paymentRequested && !value.pipeline.paymentHash && purchase.status !== "confirmed" ? " If you already confirmed in your wallet, check its history and recover the payment below before trying again." : ""}</p>}
    {!value.pipeline && <p role="status">This saved checkout is not connected to automatic purchases.</p>}
    <div className={styles.actions}>
      {value.pipeline && (value.pipeline.fundingMode !== "platform-advance" || value.opening) && purchase.status === "pending" && !value.pipeline.paymentRequested && <button className="primary" disabled={busy} onClick={() => void act("pay")}>Pay {purchase.amount} AUSD</button>}
      <button className="text-button" disabled={busy} onClick={() => void act("refresh")}>{busy ? "Checking…" : "Refresh status"}</button>
      {purchase.transactionHash && <a href={`https://sepolia.etherscan.io/tx/${purchase.transactionHash}`} target="_blank" rel="noreferrer">View payment ↗</a>}
    </div>
    {value.refund && value.refund.authorizedAtomic && <p>Unused amount: {atomic(value.refund.authorizedAtomic)} test AUSD · {value.refund.state === "confirmed" ? "Returned to your wallet" : value.refund.state === "failed" ? "Return needs review" : "Return pending"}{value.refund.transactionHash && <> · <a href={`https://sepolia.etherscan.io/tx/${value.refund.transactionHash}`} target="_blank" rel="noreferrer">View return ↗</a></>}</p>}
    <details className={styles.details}>
      <summary>Payment details{purchase.status !== "confirmed" ? " and recovery" : ""}</summary>
      <dl><div><dt>Purchase reference</dt><dd>{id}</dd></div><div><dt>Pay before</dt><dd>{new Date(purchase.expiresAt).toLocaleString()}</dd></div></dl>
      <p className={styles.note}>Paid to ImPacks · {purchase.recipientAddress}</p>
      {purchase.status !== "confirmed" && <><label className={styles.hash}>Recover an existing payment<input aria-label="Payment transaction hash" placeholder="0x…" value={hash} disabled={busy} onChange={event => setHash(event.target.value.trim())}/></label><p className={styles.note}>Already paid? Paste the transaction hash from your wallet. We’ll check the same payment; do not send it again. Payments sent before checkout expired can still be recovered.</p><button className="secondary" disabled={busy || !hash} onClick={() => void act("verify")}>Verify payment</button></>}
    </details>
    {value.opening && <><div className={styles.cards}>{value.opening.cards.map(card => <PredictionCard key={card.id} card={card} mode="sandbox"/>)}</div><button className="secondary" onClick={() => setReveal(value.opening)}>Replay pack reveal</button><p className={styles.note}>These are testnet results. Position selling is not enabled.</p></>}
    {reveal && <PackOpeningReveal opening={reveal} category={reveal.theme ?? "mixed"} onClose={() => setReveal(null)} paymentAction={value.pipeline?.fundingMode === "platform-advance" && purchase.status === "pending" && !value.pipeline.paymentRequested ? { label: `Finish purchase · ${purchase.amount} AUSD`, onClick: () => { setReveal(null); void act("pay"); } } : undefined}/>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </article>;
}

export function TestnetCheckout({ packId, budgetCents, accepted, availability, actionRef, onActivity }: { packId: Category; budgetCents: number | null; accepted: boolean; availability: ReturnType<typeof useCapabilities>; actionRef?: { current: (() => void) | null }; onActivity?: (value: { busy: boolean; budgetCents: number | null }) => void }) {
  const wallet = useAccountWallet();
  const { capabilities, error: capabilityError, loading } = availability;
  const scope = `${wallet.userId}:${wallet.address?.toLowerCase()}:${packId}`;
  const identity = useRef(scope); identity.current = scope;
  const [state, setState] = useState<{ scope: string; attempt: CheckoutAttempt | null; status: CheckoutStatus | null } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false);
  const current = state?.scope === scope ? state : null;
  const savedBudget = current?.attempt?.body.budgetCents ?? null;
  useEffect(() => { onActivity?.({ busy, budgetCents: savedBudget }); }, [busy, savedBudget, onActivity]);
  useEffect(() => {
    setError("");
    if (!wallet.address) { setState(null); return; }
    const key = checkoutAttemptKey(wallet.address, packId);
    let attempt: CheckoutAttempt | null = null;
    try { attempt = restoreCheckoutAttempt(sessionStorage.getItem(key), packId); } catch { /* storage unavailable */ }
    setState({ scope, attempt, status: null });
  }, [scope, wallet.address, packId]);
  async function prepare(makePayment = false) {
    if (inFlight.current || !wallet.address || !budgetCents || (!accepted && !current?.attempt)) return;
    const canStart = !loading && !capabilityError && capabilities?.available && capabilities.purchaseMode === "sandbox" && capabilities.paymentEnabled && capabilities.enabledPackIds?.includes(packId);
    if (!current?.attempt?.purchaseId && !canStart) {
      setError("This edition is not currently available for testnet purchase. Choose an available edition.");
      return;
    }
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
      let status = await api.checkoutStatus(token, purchase.purchaseId);
      if (identity.current !== captured) return;
      setState({ scope: captured, attempt: saved, status });
      if (canStart && !status.pipeline && status.purchase.status === "pending") {
        const access = await wallet.getAccessToken();
        if (identity.current !== captured) return;
        if (!access) throw new Error("Reconnect your account to start checkout.");
        status = await api.startPurchase(token, purchase.purchaseId, access);
        if (identity.current !== captured) return;
        setState({ scope: captured, attempt: saved, status });
      }
      if (identity.current !== captured) return;
      setState({ scope: captured, attempt: saved, status });
      if (makePayment && canStart && status.pipeline && status.pipeline.fundingMode !== "platform-advance" && status.purchase.status === "pending" && !status.pipeline.paymentRequested) {
        status = await pay(wallet, purchase.purchaseId, token, () => identity.current === captured);
      }
      if (identity.current === captured) setState({ scope: captured, attempt: saved, status });
    } catch (cause) { if (identity.current === captured) { if (cause instanceof ApiError && cause.status === 401) wallet.invalidateCheckout(); setError(message(cause)); } }
    finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => { if (actionRef) actionRef.current = () => { void prepare(true); }; return () => { if (actionRef) actionRef.current = null; }; });
  const progress = purchaseProgress(current?.status?.pipeline, !!current?.status?.opening, busy);
  if (!current?.attempt && !error && !busy) return null;
  return <section id="testnet-checkout" className={styles.panel} aria-label="Your purchase">
    <p className="eyebrow">TESTNET · AUSD</p><h2>Your purchase.</h2>
    {progress && <div className={styles.opening} role="status">{progress.spinning && <span aria-hidden="true"/>}{progress.label}</div>}
    {!current?.status && <><p>Resume your saved purchase to check payment and reveal your predictions.</p><div className={styles.actions}><button className="secondary" disabled={!wallet.address || !current?.attempt || busy || wallet.checkoutConnecting} onClick={() => void prepare()}>{busy || wallet.checkoutConnecting ? "Loading your purchase…" : "Resume purchase"}</button><a href="/dashboard">Purchase history ↗</a></div></>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {current?.status && current.status.purchase.status !== "pending" && <button className="text-button" disabled={busy} onClick={() => {
      try {
        sessionStorage.removeItem(checkoutAttemptKey(wallet.address!, packId));
        setState({ scope, attempt: null, status: null }); setError("");
      } catch { setError("Browser storage is unavailable. Your existing purchase is still in payment history."); }
    }}>Start a new checkout</button>}
    {current?.status && <PurchaseDetails key={`${scope}:${current.status.purchase.purchaseId}`} value={current.status} checkoutBusy={busy} onUpdate={status => setState(value => value?.scope === scope ? { ...value, status } : value)}/>}
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
