"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import { useAccountWallet } from "./WalletProvider";
export default function PrivyLogin() {
 const wallet = useAccountWallet();
 const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);
 const exchanging = useRef(false);
 const router = useRouter();
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
   } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not finish signing in."); exchanging.current = false; setBusy(false); }
 }
 useEffect(() => {
   if (!ready) return;
   if (new URLSearchParams(window.location.search).get("logout") === "1") {
     setBusy(true);
     void logout().then(() => window.location.replace("/login")).catch(() => { setBusy(false); setError("Could not sign out. Please try again."); });
     return;
   }
   if (authenticated && wallet.ready && wallet.address) void continueToPacks();
 }, [ready, authenticated, wallet.ready, wallet.address]);
 return <div className="privy-signin"><button className="primary auth-continue" disabled={!ready || busy || wallet.creating || (authenticated && !wallet.ready)} onClick={() => authenticated ? (wallet.address ? void continueToPacks() : void wallet.create()) : login()}>{!ready ? "Preparing sign in…" : busy ? "Taking you to your packs…" : authenticated ? (wallet.creating ? "Creating your wallet…" : wallet.address ? "Continue to packs" : "Create my wallet") : "Connect wallet"}<span aria-hidden="true">↗</span></button><p className="signin-methods">Email · Google · Wallet</p>{(error || wallet.error) && <p className="error" role="alert">{error || wallet.error}</p>}{authenticated && !busy && <button className="text-button" onClick={() => void logout()}>Use another account</button>}<div className="privy-credit">Secured by <strong>privy</strong></div></div>;
}
