"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletAccount } from "./WalletAccount";

export function SiteHeader() {
  const pathname = usePathname();
  return <header className="site-header app-header">
    <Link className="logo" href="/" aria-label="ImPacks home">im<span>packs</span><sup>®</sup></Link>
    <nav aria-label="Main navigation">{[
      { href: "/", label: "Home", active: pathname === "/" },
      { href: "/packs", label: "Packs", active: pathname === "/packs" || pathname.startsWith("/category/") },
      { href: "/marketplace", label: "Trade", active: pathname === "/marketplace" },
      { href: "/dashboard", label: "Dashboard", active: pathname === "/dashboard" },
    ].map(item => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</Link>)}</nav>
    <div className="account"><WalletAccount/></div>
  </header>;
}
