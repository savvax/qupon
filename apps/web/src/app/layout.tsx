import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Qupon · Registrar Console",
  description:
    "Corporate-actions console for tokenized bonds on Solana devnet (KASE × Superteam Kazakhstan).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-200 antialiased">
        <Providers>
          <Header />
          <main className="mx-auto max-w-6xl px-4 pb-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
