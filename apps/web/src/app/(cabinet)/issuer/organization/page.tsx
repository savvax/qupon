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
  const org =
    user && !user.isDemo
      ? await boFetch<{ organization: Org } | null>("/org").catch(() => null)
      : null;

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
      <Card className="mt-6">
        <h2 className="mb-4 text-lg font-bold">
          <StableText>{t("profile.title")}</StableText>
        </h2>
        {user?.isDemo || !org ? (
          <p className="text-sm text-n600">
            <StableText>{t(user?.isDemo ? "profile.demo" : "team.empty")}</StableText>
          </p>
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
