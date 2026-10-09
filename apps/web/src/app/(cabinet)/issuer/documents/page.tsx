import { getLocale, getTranslations } from "next-intl/server";
import { DataTable } from "@/components/ui/DataTable";
import { formatDate } from "@/lib/format";
import { formatBytes } from "@/lib/kyc";
import { StableText } from "@/components/i18n/StableLabel";
import { Card } from "@/components/ui/Card";
import { boFetch } from "@/lib/bo";
import { getSession } from "@/lib/session";
import { toLocale } from "@/i18n/locale";
import { DocumentsPanel, type DocumentRow } from "./DocumentsPanel";

export async function generateMetadata() {
  const t = await getTranslations("org.documents");
  return { title: `${t("title")} · Qupon` };
}

/** The issuer's own uploads (task 807): prospectuses and decisions to attach to series. */
export default async function IssuerDocumentsPage() {
  const t = await getTranslations("org.documents");
  const locale = toLocale(await getLocale());
  const user = await getSession();
  const docs = user
    ? ((
        await boFetch<{ documents: DocumentRow[] }>("/me/documents").catch(
          () => null,
        )
      )?.documents ?? [])
    : [];

  return (
    <div className="max-w-3xl">
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
        <DataTable
          rows={docs}
          rowKey={(d) => String(d.id)}
          empty={user?.isDemo ? t("emptyDemo") : t("empty")}
          columns={[
            {
              key: "file",
              header: t("colFilename"),
              render: (d) => (
                <span className="font-medium break-all text-n900">
                  {d.filename}
                </span>
              ),
            },
            {
              key: "kind",
              header: t("colKind"),
              render: (d) => (
                <span>
                  {t.has(`kinds.${d.kind}`) ? t(`kinds.${d.kind}`) : d.kind}
                  {d.seriesMint ? (
                    <span className="ml-1 text-xs text-g600">
                      · {t("attached")}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: "size",
              header: t("colSize"),
              align: "right",
              render: (d) => <span className="num">{formatBytes(d.size)}</span>,
            },
            {
              key: "date",
              header: t("colDate"),
              render: (d) => (
                <span className="num">
                  {formatDate(
                    new Date(d.createdAt * 1000).toISOString(),
                    locale,
                  )}
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
