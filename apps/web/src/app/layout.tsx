import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { getLocale } from "next-intl/server";
import "./globals.css";
import Providers from "@/components/Providers";
import { ScopedIntl } from "@/components/i18n/ScopedIntl";
import { type Locale } from "@/i18n/request";
import { getNetwork } from "@/lib/network";

const manrope = Manrope({
  // cyrillic-ext carries the Kazakh letters (Ә Ғ Қ Ң Ө Ұ Ү Һ І): without it the browser falls back
  // to a system face mid-word and Ұйым renders double-struck (design pre-flight #20).
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-manrope",
  display: "swap",
});

const DESCRIPTION =
  "Record date, entitlements, escrowed settlement and ISO 20022 for tokenized bonds on Solana (devnet).";

const SITE_URL = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
})();

export const metadata: Metadata = {
  // Absolute base for the OG image URL (opengraph-image.png file convention).
  metadataBase: SITE_URL,
  title: {
    default: "Qupon",
    template: "%s · Qupon",
  },
  description: DESCRIPTION,
  openGraph: {
    title: { default: "Qupon", template: "%s · Qupon" },
    description: DESCRIPTION,
    type: "website",
    siteName: "Qupon",
  },
};

/**
 * Client messages every route needs (the shell + Providers tree lives above any page provider): toasts, wallet,
 * network guard, error/not-found boundaries, the public shell's stabilized nav/footer labels. Everything else is
 * scoped per route by <ScopedIntl> (task 91575: 676 KB → ~250 KB landing HTML).
 */
const GLOBAL_PATHS = [
  "common",
  "errors.crash",
  "wallet.button",
  "wallet.dialog",
  "network.confirm",
  "kit.network",
  "bonds.unavailable",
] as const;

/** Stabilized labels of the root tree (shells render above any page provider): nav/footer texts + wallet/toasts. */
const GLOBAL_MAP_PATHS = ["common", "nav", "footer", "wallet.button"] as const;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = (await getLocale()) as Locale;
  const network = await getNetwork();
  return (
    <html lang={locale} className={manrope.variable}>
      <body className="min-h-screen font-sans">
        <ScopedIntl paths={GLOBAL_PATHS} mapPaths={GLOBAL_MAP_PATHS}>
          <Providers network={network}>{children}</Providers>
        </ScopedIntl>
      </body>
    </html>
  );
}
