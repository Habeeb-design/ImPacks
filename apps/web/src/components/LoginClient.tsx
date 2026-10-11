"use client";
import dynamic from "next/dynamic";
const PrivyLogin = dynamic(() => import("./PrivyLogin"), { ssr: false, loading: () => <button className="primary auth-continue" disabled>Preparing sign in…</button> });
export function LoginClient() {
 const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
 return appId ? <PrivyLogin/> : <div><p role="status">Sign-in is being connected. You can explore packs in the meantime.</p><a className="primary" href="/packs">Explore packs →</a></div>;
}
