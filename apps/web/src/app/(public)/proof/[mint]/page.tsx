import { getTranslations } from "next-intl/server";
import { ScopedIntl } from "@/components/i18n/ScopedIntl";
import { ProofView } from "@/components/proof/ProofView";
import { shortKey } from "@/lib/format";

/** Only what the in-browser verifier's client tree reads (task 91575). */
const SCOPE = [
  "proof",
  "bond",
  "landing.kinds",
  "landing.simulated",
  "status",
  "common",
  "kit.prov",
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const [{ mint }, t] = await Promise.all([params, getTranslations("proof")]);
  return { title: t("meta", { ticker: shortKey(mint) }) };
}

/** Public proof of one series: everything is read from devnet and verified in the browser (components/proof). */
export default async function ProofPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  return (
    <ScopedIntl paths={SCOPE}>
      <ProofView mint={mint} />
    </ScopedIntl>
  );
}
