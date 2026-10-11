import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles.css";
import { WalletProvider } from "../components/WalletProvider";

export const metadata: Metadata = {
  title: "ImPacks — Gamble on gambling",
  description: "Pick a theme, open a pack, and discover your next three predictions.",
};
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><WalletProvider>{children}</WalletProvider></body></html>;
}
