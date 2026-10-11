import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles.css";

export const metadata: Metadata = {
  title: "ImPacks — Open your next prediction",
  description: "Pick a theme, open a pack, and discover your next three predictions.",
};
export const viewport: Viewport = { themeColor: "#f5f1e8" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
