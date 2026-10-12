import { getTranslations } from "next-intl/server";
import { ScopedIntl } from "@/components/i18n/ScopedIntl";
import { ProofPicker } from "@/components/proof/ProofPicker";

/** Only what the picker's client tree reads (task 91575). */
const SCOPE = ["proof.pick", "common"] as const;

export async function generateMetadata() {
  return { title: (await getTranslations("proof.pick"))("title") };
}

export default function ProofIndex() {
  return (
    <ScopedIntl paths={SCOPE}>
      <ProofPicker />
    </ScopedIntl>
  );
}
