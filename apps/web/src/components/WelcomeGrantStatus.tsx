"use client";
import { useEffect, useState } from "react";
import type { WelcomeGrant } from "@impacks/contracts";
import { useAccountWallet } from "./WalletProvider";
import { api } from "../lib/api";

export function useWelcomeGrant() {
  const wallet = useAccountWallet();
  const [grant, setGrant] = useState<WelcomeGrant|null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setGrant(null); setError("");
    if (!wallet.ready || !wallet.authenticated || !wallet.address || !wallet.embedded) return;
    let active = true, enqueued = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      let delay = 5000;
      try {
        const token = await wallet.getAccessToken();
        if (!active) return;
        if (!token) throw new Error("Privy token is not ready");
        const result = await api.welcomeGrant(token, !enqueued);
        enqueued = true;
        if (!active) return;
        setGrant(result); setError("");
        if (!["pending", "confirming"].includes(result.status)) return;
      } catch {
        if (!active) return;
        setError("Welcome AUSD status is unavailable. We’ll check again shortly.");
        delay = 30000;
      }
      if (active) timer = setTimeout(() => void check(), delay);
    }
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [wallet.ready, wallet.authenticated, wallet.address, wallet.embedded, wallet.userId, wallet.getAccessToken]);
  return { grant, error };
}

export function WelcomeGrantStatus({ grant, error }: { grant: WelcomeGrant|null; error: string }) {
  if (error) return <p className="wallet-payment-note" role="status">{error}</p>;
  if (!grant || grant.status === "disabled" || grant.status === "ineligible") return null;
  const message = grant.status === "confirmed" ? "Your 50 test AUSD welcome grant has arrived."
    : grant.status === "confirming" ? "Your 50 test AUSD welcome grant is confirming on Ethereum Sepolia."
    : grant.status === "needs_attention" ? "Your welcome grant needs a funding review. No new payment will be sent automatically."
    : "Your 50 test AUSD welcome grant is queued. You can leave this page while it processes.";
  return <div><p className="wallet-payment-note" role="status">{message}</p>
    {grant.transactionHash && <a className="wallet-explorer" href={`https://sepolia.etherscan.io/tx/${grant.transactionHash}`} target="_blank" rel="noreferrer">View welcome transfer ↗</a>}
  </div>;
}
