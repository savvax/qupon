import { Header } from "@/components/Header";
import { MOCK_ENABLED } from "@/lib/api";

/** Pre-redesign console pages (dark). Replaced route by route in plan 3. */
export default function LegacyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className="min-h-screen bg-neutral-950 text-neutral-200"
      style={{ colorScheme: "dark" }}
    >
      <Header />
      {MOCK_ENABLED && (
        <div className="bg-amber-500 px-4 py-1 text-center text-xs font-bold tracking-wide text-black">
          MOCK DATA — set API_MOCKING=disabled to use the registrar API
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 pb-16">{children}</main>
    </div>
  );
}
