"use client";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { PrivyProvider, usePrivy, useWallets, useCreateWallet } from "@privy-io/react-auth";
import type { WalletSession, CheckoutPurchase } from "@impacks/contracts";
import { checkoutTransaction } from "../lib/payment";
import { toHex } from "viem";
import { validateCheckoutChallenge } from "../lib/checkout";
import { sepolia } from "viem/chains";
import { api } from "../lib/api";
type WalletState = { sendCheckoutPayment: (purchase: CheckoutPurchase) => Promise<string>; checkoutToken: string | null; checkoutConnecting: boolean; authorizeCheckout: () => Promise<string>; invalidateCheckout: () => void; configured: boolean; authReady: boolean; userId: string | null; getAccessToken: () => Promise<string | null>; ready: boolean; authenticated: boolean; address: string | null; embedded: boolean; creating: boolean; error: string; create: () => Promise<void>; disconnect: () => Promise<void> };
const WalletContext = createContext<WalletState>({ sendCheckoutPayment: async()=>{throw new Error("Wallet is unavailable.");}, checkoutToken:null, checkoutConnecting:false, authorizeCheckout:async()=>{throw new Error("Sign in to connect your wallet.");}, invalidateCheckout:()=>{}, configured:false, authReady:false, userId:null, getAccessToken:async()=>null, ready:false, authenticated:false, address:null, embedded:false, creating:false, error:"", create:async()=>{}, disconnect:async()=>{} });
export const useAccountWallet = () => useContext(WalletContext);
function WalletStateProvider({ children }: {children: ReactNode}) {
 const { ready, authenticated, user, getAccessToken, logout } = usePrivy();
 const { wallets, ready: walletsReady } = useWallets();
 const { createWallet } = useCreateWallet();
 const [creating, setCreating] = useState(false);
 const [error, setError] = useState("");
 const wallet = authenticated ? wallets.find(w => w.walletClientType === "privy") ?? wallets.find(w => w.linked) : undefined;
 const owner = `${authenticated ? user?.id : ""}:${wallet?.address.toLowerCase() ?? ""}`;
 const identity = useRef(owner); identity.current = owner;
 const [checkout, setCheckout] = useState<{ owner: string; session: WalletSession } | null>(null);
 const [checkoutConnecting, setCheckoutConnecting] = useState(false);
 const pending = useRef<Promise<string> | null>(null);
 const checkoutToken = checkout?.owner === owner && Date.parse(checkout.session.expiresAt) > Date.now() ? checkout.session.token : null;
 function invalidateCheckout() { setCheckout(null); }
 async function authorizeCheckout(): Promise<string> {
   if (!wallet || !authenticated || !user) throw new Error("Sign in and create your wallet first.");
   if (checkoutToken && checkout && Date.parse(checkout.session.expiresAt) > Date.now() + 30_000) return checkoutToken;
   if (pending.current) return pending.current;
   const captured = owner;
   setCheckoutConnecting(true);
   const task = (async () => {
     const challenge = await api.walletChallenge(wallet.address);
     if (identity.current !== captured) throw new Error("Account changed. Connect your current wallet.");
     validateCheckoutChallenge(challenge, wallet.address, window.location.origin);
     const provider = await wallet.getEthereumProvider();
     const signature = await provider.request({ method: "personal_sign", params: [toHex(challenge.message), wallet.address] });
     if (identity.current !== captured) throw new Error("Account changed. Connect your current wallet.");
     const session = await api.walletVerify({ challengeId: challenge.challengeId, signature });
     if (identity.current !== captured || session.walletAddress.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("Account changed. Connect your current wallet.");
     setCheckout({ owner: captured, session });
     return session.token;
   })();
   pending.current = task;
   try { return await task; } finally { pending.current = null; setCheckoutConnecting(false); }
 }
 async function sendCheckoutPayment(purchase: CheckoutPurchase): Promise<string> {
   if (!wallet || !authenticated) throw new Error("Connect your payment wallet first.");
   const captured = owner;
   const transaction = checkoutTransaction(purchase, wallet.address);
   await wallet.switchChain(sepolia.id);
   const provider = await wallet.getEthereumProvider();
   const chainId = await provider.request({ method: "eth_chainId" });
   if (Number(chainId) !== sepolia.id || identity.current !== captured) throw new Error("Wallet or network changed before payment.");
   // The explicit user action opens the wallet confirmation. Never retry this request automatically.
   const hash = await provider.request({ method: "eth_sendTransaction", params: [transaction] });
   if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Wallet payment result is uncertain. Check wallet history before retrying.");
   return hash;
 }
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
     if (checkoutToken) await api.walletLogout(checkoutToken).catch(() => undefined);
     invalidateCheckout();
     await logout();
     sessionStorage.removeItem("impacks.demo.session"); sessionStorage.removeItem("impacks.demo.attempt");
     window.location.assign("/");
   } catch { setError("Could not disconnect. Please try again."); }
 }
 return <WalletContext.Provider value={{sendCheckoutPayment,checkoutToken,checkoutConnecting,authorizeCheckout,invalidateCheckout,configured:true,authReady:ready,userId:user?.id ?? null,getAccessToken,ready:ready && walletsReady,authenticated,address:wallet?.address ?? null,embedded:wallet?.walletClientType === "privy",creating,error,create,disconnect}}>{children}</WalletContext.Provider>;
}
export function WalletProvider({children}: {children: ReactNode}) {
 const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
 if (!appId) return <>{children}</>;
 return <PrivyProvider appId={appId} config={{appearance:{theme:"light",accentColor:"#171717",landingHeader:"Your ImPacks wallet",loginMessage:"Sign in to create your wallet and explore AUSD packs."},loginMethods:["email"],defaultChain:sepolia,supportedChains:[sepolia],embeddedWallets:{ethereum:{createOnLogin:"all-users"}}}}><WalletStateProvider>{children}</WalletStateProvider></PrivyProvider>;
}
