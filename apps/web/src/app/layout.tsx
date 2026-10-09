import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";
import Providers from "@/components/Providers";
import { AltLabelsProvider } from "@/components/i18n/StableLabel";
import { altLabelMap } from "@/i18n/altLabels";
import { LOCALES, type Locale, loadMessages } from "@/i18n/request";
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
  const locale = (await getLocale()) as Locale;
  const network = await getNetwork();
  // Controls reserve the width of the longest label across ALL other locales (spec §5.8).
  const others = await Promise.all(
    LOCALES.filter((l) => l !== locale).map((l) => loadMessages(l as Locale)),
  );
  const altLabels = altLabelMap(await loadMessages(locale), ...others);
  return (
    <html lang={locale} className={manrope.variable}>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider>
          <AltLabelsProvider map={altLabels}>
            <Providers network={network}>{children}</Providers>
          </AltLabelsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
