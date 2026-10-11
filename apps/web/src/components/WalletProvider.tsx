"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { PrivyProvider, usePrivy, useWallets, useCreateWallet } from "@privy-io/react-auth";
import { baseSepolia } from "viem/chains";
import { api } from "../lib/api";
type WalletState = { configured: boolean; authReady: boolean; userId: string | null; getAccessToken: () => Promise<string | null>; ready: boolean; authenticated: boolean; address: string | null; embedded: boolean; creating: boolean; error: string; create: () => Promise<void>; disconnect: () => Promise<void> };
const WalletContext = createContext<WalletState>({ configured:false, authReady:false, userId:null, getAccessToken:async()=>null, ready:false, authenticated:false, address:null, embedded:false, creating:false, error:"", create:async()=>{}, disconnect:async()=>{} });
export const useAccountWallet = () => useContext(WalletContext);
function WalletStateProvider({ children }: {children: ReactNode}) {
 const { ready, authenticated, user, getAccessToken, logout } = usePrivy();
 const { wallets, ready: walletsReady } = useWallets();
 const { createWallet } = useCreateWallet();
 const [creating, setCreating] = useState(false);
 const [error, setError] = useState("");
 const wallet = authenticated ? wallets.find(w => w.walletClientType === "privy") ?? wallets.find(w => w.linked) : undefined;
 async function create() {
   if (creating) return;
   setCreating(true); setError("");
   try { await createWallet(); } catch { setError("Wallet setup didn’t finish. Please try again."); } finally { setCreating(false); }
 }
 async function disconnect() {
   setError("");
   try {
     const stored = JSON.parse(sessionStorage.getItem("impacks.demo.session") ?? "null");
     if (stored?.token) await api.logout(stored.token).catch(() => undefined);
     await logout();
     sessionStorage.removeItem("impacks.demo.session"); sessionStorage.removeItem("impacks.demo.attempt");
     window.location.assign("/");
   } catch { setError("Could not disconnect. Please try again."); }
 }
 return <WalletContext.Provider value={{configured:true,authReady:ready,userId:user?.id ?? null,getAccessToken,ready:ready && walletsReady,authenticated,address:wallet?.address ?? null,embedded:wallet?.walletClientType === "privy",creating,error,create,disconnect}}>{children}</WalletContext.Provider>;
}
export function WalletProvider({children}: {children: ReactNode}) {
 const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
 if (!appId) return <>{children}</>;
 return <PrivyProvider appId={appId} config={{appearance:{theme:"light",accentColor:"#171717",landingHeader:"Your ImPacks wallet",loginMessage:"Sign in to create your wallet and explore AUSD packs."},loginMethods:["email"],defaultChain:baseSepolia,supportedChains:[baseSepolia],embeddedWallets:{ethereum:{createOnLogin:"all-users"}}}}><WalletStateProvider>{children}</WalletStateProvider></PrivyProvider>;
}
