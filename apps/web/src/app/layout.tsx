import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";
import Providers from "@/components/Providers";
import { getNetwork } from "@/lib/network";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const network = await getNetwork();
  return (
    <html lang={locale} className={manrope.variable}>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider>
          <Providers network={network}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
