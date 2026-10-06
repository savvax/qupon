import { getLocale, getTranslations } from "next-intl/server";
import { StableText } from "@/components/i18n/StableLabel";
import { Card } from "@/components/ui/Card";
import { boFetch } from "@/lib/bo";
import { getSession } from "@/lib/session";
import { DocumentsPanel, type DocumentRow } from "./DocumentsPanel";

export async function generateMetadata() {
  const t = await getTranslations("org.documents");
  return { title: `${t("title")} · Qupon` };
}

/** The issuer's own uploads (task 807): prospectuses and decisions to attach to series. */
export default async function IssuerDocumentsPage() {
  const t = await getTranslations("org.documents");
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const user = await getSession();
  const docs = user
    ? (
        await boFetch<{ documents: DocumentRow[] }>("/me/documents").catch(
          () => null,
        )
      )?.documents ?? []
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">
          <StableText>{t("title")}</StableText>
        </h1>
        <p className="mt-1 text-sm text-n600">
          <StableText>{t("lead")}</StableText>
        </p>
      </header>
      <div className="mt-6 space-y-6">
        {!user?.isDemo && (
          <Card>
            <h2 className="mb-4 text-lg font-bold">
              <StableText>{t("upload")}</StableText>
            </h2>
            <DocumentsPanel />
          </Card>
        )}
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-n200 text-left text-xs text-n500">
                <th className="py-2 pr-4 font-semibold">{t("colFilename")}</th>
                <th className="py-2 pr-4 font-semibold">{t("colKind")}</th>
                <th className="py-2 pr-4 font-semibold">{t("colSize")}</th>
                <th className="py-2 font-semibold">{t("colDate")}</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-n500">
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id} className="border-b border-n100 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-n900">
                      {d.filename}
                    </td>
                    <td className="py-2.5 pr-4">
                      {t.has(`kinds.${d.kind}`) ? t(`kinds.${d.kind}`) : d.kind}
                      {d.seriesMint ? (
                        <span className="ml-1 text-xs text-g600">
                          · {t("attached")}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4 num">
                      {(d.size / 1024).toFixed(0)} KB
                    </td>
                    <td className="py-2.5 num">
                      {new Date(d.createdAt * 1000).toLocaleDateString(
                        locale === "ru" ? "ru-RU" : "en-US",
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
