import { getTranslations } from "next-intl/server";
import { StableText } from "@/components/i18n/StableLabel";
import { Card } from "@/components/ui/Card";
import { boFetch } from "@/lib/bo";
import { getSession } from "@/lib/session";
import { OrgForm } from "./OrgForm";

export async function generateMetadata() {
  const t = await getTranslations("org");
  return { title: `${t("title")} · Qupon` };
}

/** The issuer's organisation profile (task 807): it scopes the series the team can act on. */
export default async function OrganizationPage() {
  const t = await getTranslations("org");
  const user = await getSession();
  // demo issuers read their (shared) organisation too — only editing is off for them
  const org = user
    ? await boFetch<{ organization: Org } | null>("/org").catch(() => null)
    : null;

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
      <Card className="mt-6">
        <h2 className="mb-4 text-lg font-bold">
          <StableText>{t("profile.title")}</StableText>
        </h2>
        {!org ? (
          <p className="text-sm text-n600">
            <StableText>{t("team.empty")}</StableText>
          </p>
        ) : user?.isDemo ? (
          <>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              {(
                [
                  ["name", org.organization.name],
                  [
                    "kind",
                    t.has(`profile.kinds.${org.organization.kind}`)
                      ? t(`profile.kinds.${org.organization.kind}`)
                      : org.organization.kind,
                  ],
                  ["bin", org.organization.bin || "—"],
                  ["website", org.organization.website || "—"],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs font-semibold text-n500">
                    {t(`profile.${k}`)}
                  </dt>
                  <dd className="mt-0.5 break-words text-n900">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 rounded-btn bg-n50 px-3 py-2 text-xs text-n600">
              <StableText>{t("profile.demo")}</StableText>
            </p>
          </>
        ) : (
          <OrgForm org={org.organization} />
        )}
      </Card>
    </div>
  );
}

export type Org = {
  id: number;
  name: string;
  kind: string;
  bin: string;
  website: string;
  createdAt: number;
};
