import { getTranslations } from "next-intl/server";
import { NewSeriesWizard } from "./NewSeriesWizard";

export default async function NewSeriesPage() {
  const t = await getTranslations("issuer.wizard");
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-n600">{t("lead")}</p>
      <div className="mt-6">
        <NewSeriesWizard />
      </div>
    </div>
  );
}
