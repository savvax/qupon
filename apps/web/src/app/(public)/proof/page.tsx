import { getTranslations } from "next-intl/server";
import { ProofPicker } from "@/components/proof/ProofPicker";

export async function generateMetadata() {
  return { title: (await getTranslations("proof.pick"))("title") };
}

export default function ProofIndex() {
  return <ProofPicker />;
}
