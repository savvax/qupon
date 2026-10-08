import { getTranslations } from "next-intl/server";
import { metaTitle } from "@/lib/meta";
import { SystemPanel } from "./SystemPanel";

export async function generateMetadata() {
  return { title: await metaTitle("adminSystem") };
}

/** System health (platform v2 §5.2): renders GET /admin/system with status
 * dots; the client panel refreshes every 15 s. Read-only, nothing audited. */
export default async function AdminSystemPage() {
  const t = await getTranslations("admin.system");
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty text-n600">
          {t("lead")}
        </p>
      </header>
      <SystemPanel />
    </div>
  );
}
