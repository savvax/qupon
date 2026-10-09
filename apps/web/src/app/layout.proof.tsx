import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

/**
 * Root layout of the static proof export only (`pnpm build:proof` sets pageExtensions to `proof.tsx`, so this file,
 * page.proof.tsx and the proof/…/page.proof.tsx files are the whole site). The app's own root is layout.tsx.
 */
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Qupon proof", template: "%s · Qupon" },
  description:
    "Every corporate action of a tokenized bond, re-verified in your browser from Solana devnet.",
};

export default function ProofRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
