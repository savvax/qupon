import { getTranslations } from "next-intl/server";
import { StableText } from "@/components/i18n/StableLabel";
import { cashOptions } from "@/lib/cashOptions";
import { NewSeriesWizard } from "./NewSeriesWizard";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("issuerNewSeries") };
}

export default async function NewSeriesPage() {
  const t = await getTranslations("issuer.wizard");
  const assets = await cashOptions();
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight">
        <StableText>{t("title")}</StableText>
      </h1>
      <p className="mt-1 text-n600">
        <StableText>{t("lead")}</StableText>
      </p>
      <div className="mt-6">
        <NewSeriesWizard assets={assets} />
      </div>
    </div>
  );
}
