"use client";
import { useEffect, useState } from "react";
import { useAccountWallet } from "./WalletProvider";
import { api } from "../lib/api";
import type { WalletBalance } from "@impacks/contracts";
import { WelcomeGrantStatus, useWelcomeGrant } from "./WelcomeGrantStatus";
function WalletIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v11H6a3 3 0 0 1-3-3V6"/><path d="M20 12h-5v5h5"/><path d="M17 14.5h.01"/></svg>; }
export function WalletAccount() {
 const wallet = useAccountWallet();
 const welcome = useWelcomeGrant();
 const [balance, setBalance] = useState<WalletBalance|null>(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState("");
 const [copied, setCopied] = useState(false);
 const [revision, setRevision] = useState(0);
 useEffect(() => {
   setBalance(null); setCopied(false); setError("");
   if (!wallet.address) return;
   let active = true; setLoading(true);
   api.walletBalance(wallet.address).then(value => { if(active) setBalance(value); }).catch(() => { if(active) setError("Balance unavailable. Try refreshing."); }).finally(() => { if(active) setLoading(false); });
   return () => { active = false; };
 }, [wallet.address, revision, welcome.grant?.status]);
 if (!wallet.authenticated) return <a className="wallet-connect" href="/login"><WalletIcon/><span>Connect wallet</span><span className="wallet-token">AUSD</span></a>;
 if (!wallet.ready) return <button className="wallet-connect" disabled><WalletIcon/>Loading wallet…</button>;
 const short = wallet.address ? `${wallet.address.slice(0,6)}…${wallet.address.slice(-4)}` : "Set up wallet";
 return <details className="wallet-menu" onKeyDown={event=>{ if(event.key === "Escape") { event.currentTarget.open=false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary className="wallet-connect" aria-label={`Wallet ${short}`}><span className="wallet-status"/><span>{short}</span><span className="wallet-token">AUSD</span><span aria-hidden="true">⌄</span></summary><div className="wallet-popover"><div className="wallet-popover-heading"><strong>Your wallet</strong><span className="wallet-network">Ethereum Sepolia</span></div>{wallet.address ? <><WelcomeGrantStatus grant={welcome.grant} error={welcome.error}/><p className="wallet-kind">{wallet.embedded ? "Privy embedded wallet" : "Linked wallet"}</p><p className="wallet-address">{wallet.address}</p><div className="wallet-balance"><span>Testnet balance</span><strong>{loading ? "…" : balance ? balance.formatted : "—"} <small>AUSD</small></strong></div><div className="wallet-actions"><button onClick={()=>void navigator.clipboard.writeText(wallet.address!).then(()=>setCopied(true)).catch(()=>setError("Copy failed. Select the address above to copy it."))}>{copied ? "Copied ✓" : "Copy address"}</button><button disabled={loading} onClick={()=>setRevision(v=>v+1)}>Refresh balance</button></div><a className="wallet-explorer" href={`https://sepolia.etherscan.io/address/${wallet.address}`} target="_blank" rel="noreferrer">View on explorer ↗</a><p className="wallet-payment-note">AUSD pack payments are coming next. Pack openings are simulated and do not spend this balance.</p></> : <><p>Your account is signed in. Create your wallet to hold testnet AUSD.</p><button className="primary" disabled={wallet.creating} onClick={()=>void wallet.create()}>{wallet.creating ? "Creating your wallet…" : "Create my wallet"}</button></>}{(error || wallet.error) && <p className="wallet-error" role="alert">{error || wallet.error}</p>}<button className="wallet-disconnect" onClick={()=>void wallet.disconnect()}>Disconnect & sign out</button></div></details>;
}
