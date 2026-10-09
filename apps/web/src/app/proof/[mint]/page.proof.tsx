import { DEMO_SERIES } from "@/lib/proof/demoSeries";
import { ProofStatic } from "@/components/proof/ProofStatic";

/** Pre-rendered for the demo series plus PROOF_MINTS (comma-separated); any other mint uses /proof/?mint=. */
export const dynamicParams = false;
export function generateStaticParams() {
  const extra = (process.env.PROOF_MINTS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return [...new Set([...DEMO_SERIES.map((d) => d.mint), ...extra])].map((mint) => ({ mint }));
}

export default async function ProofOfMint({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return <ProofStatic mint={mint} />;
}
