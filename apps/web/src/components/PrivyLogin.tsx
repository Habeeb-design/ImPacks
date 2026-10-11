"use client";
import { useLoginWithEmail, usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import { useAccountWallet } from "./WalletProvider";

export default function PrivyLogin() {
 const wallet = useAccountWallet();
 const { ready, authenticated, logout, getAccessToken } = usePrivy();
 const { sendCode, loginWithCode } = useLoginWithEmail();
 const [email, setEmail] = useState("");
 const [code, setCode] = useState("");
 const [step, setStep] = useState<"email"|"code">("email");
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);
 const [resendAfter, setResendAfter] = useState(0);
 const exchanging = useRef(false);
 const creatingWallet = useRef(false);
 const router = useRouter();

 useEffect(() => {
   if (resendAfter <= 0) return;
   const timer = window.setTimeout(() => setResendAfter(value => Math.max(0,value-1)),1000);
   return () => window.clearTimeout(timer);
 }, [resendAfter]);

 async function requestCode() {
   if (busy || !ready) return;
   setBusy(true); setError("");
   try { await sendCode({email:email.trim()}); setStep("code"); setCode(""); setResendAfter(30); }
   catch { setError("We couldn’t send your code. Check your email address and try again."); }
   finally { setBusy(false); }
 }
 async function submit(event: FormEvent<HTMLFormElement>) {
   event.preventDefault();
   if (busy || !ready) return;
   if (step === "email") { await requestCode(); return; }
   setBusy(true); setError("");
   try { await loginWithCode({code:code.trim()}); }
   catch { setError("That code couldn’t be verified. Try again or request a new code."); }
   finally { setBusy(false); }
 }
 async function continueToPacks() {
   if (exchanging.current) return;
   exchanging.current = true; setBusy(true); setError("");
   try {
     const token = await getAccessToken();
     if (!token) throw new Error("Please sign in again to continue.");
     const session = await api.privyLogin(token);
     sessionStorage.setItem("impacks.demo.session", JSON.stringify(session));
     sessionStorage.removeItem("impacks.demo.attempt");
     router.replace("/packs");
   } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not finish signing in."); exchanging.current=false; setBusy(false); }
 }
 useEffect(() => {
   if (!ready) return;
   if (new URLSearchParams(window.location.search).get("logout") === "1") {
     setBusy(true);
     void logout().then(() => window.location.replace("/login")).catch(() => { setBusy(false); setError("Could not sign out. Please try again."); });
     return;
   }
   if (!authenticated) { creatingWallet.current=false; exchanging.current=false; return; }
   if (!wallet.ready) return;
   if (wallet.address) { void continueToPacks(); return; }
   // Privy's custom email flow does not run modal-based automatic wallet creation.
   // Attempt once after authentication; a failed attempt leaves an explicit retry.
   if (!creatingWallet.current) { creatingWallet.current=true; void wallet.create(); }
 }, [ready, authenticated, wallet.ready, wallet.address]);

 return <div className="privy-signin">
   {!authenticated ? <form className="email-signin" onSubmit={event=>void submit(event)}>
     {step === "email" ? <label htmlFor="login-email">Email address<input id="login-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={event=>setEmail(event.target.value)} required disabled={busy} maxLength={254}/></label> : <><p className="email-code-note" role="status">Enter the code sent to <strong>{email.trim()}</strong>.</p><label htmlFor="login-code">Verification code<input id="login-code" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))} minLength={6} maxLength={6} pattern="[0-9]{6}" required disabled={busy} autoFocus/></label></>}
     <button className="primary auth-continue" disabled={!ready || busy || (step === "code" && code.length !== 6)}>{!ready ? "Preparing sign in…" : busy ? (step === "email" ? "Sending your code…" : "Verifying…") : step === "email" ? "Continue with email" : "Verify & continue"}<span aria-hidden="true">↗</span></button>
     {step === "email" ? <p className="signin-methods">We’ll email you a sign-in code. No password needed.</p> : <div className="email-code-actions"><button type="button" className="text-button" disabled={busy} onClick={()=>{setStep("email");setCode("");setError("");}}>Change email</button><button type="button" className="text-button" disabled={busy || resendAfter>0} onClick={()=>void requestCode()}>{resendAfter>0 ? `Resend in ${resendAfter}s` : "Resend code"}</button></div>}
   </form> : <button className="primary auth-continue" disabled={busy || wallet.creating || !wallet.ready} onClick={()=>wallet.address ? void continueToPacks() : void wallet.create()}>{busy ? "Taking you to your packs…" : wallet.creating || !wallet.ready ? "Setting up your wallet…" : wallet.address ? "Continue to packs" : "Retry wallet setup"}</button>}
   {(error || wallet.error) && <p className="error" role="alert">{error || wallet.error}</p>}
   {authenticated && !busy && <button className="text-button" onClick={()=>void logout()}>Use another email</button>}
   <div className="privy-credit">Secured by <strong>privy</strong></div>
 </div>;
}
