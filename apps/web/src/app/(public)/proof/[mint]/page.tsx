import { getTranslations } from "next-intl/server";
import { ProofView } from "@/components/proof/ProofView";
import { shortKey } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }) {
  const [{ mint }, t] = await Promise.all([params, getTranslations("proof")]);
  return { title: t("meta", { ticker: shortKey(mint) }) };
}

/** Public proof of one series: everything is read from devnet and verified in the browser (components/proof). */
export default async function ProofPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return <ProofView mint={mint} />;
}
