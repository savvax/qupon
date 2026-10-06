import { getTranslations } from "next-intl/server";
import { StableText } from "@/components/i18n/StableLabel";
import { Card } from "@/components/ui/Card";
import { boFetch } from "@/lib/bo";
import { getSession } from "@/lib/session";
import { TeamPanel, type Member } from "./TeamPanel";

export async function generateMetadata() {
  const t = await getTranslations("org.team");
  return { title: `${t("title")} · Qupon` };
}

/** Organisation members and one-time invite links (task 807). */
export default async function TeamPage() {
  const t = await getTranslations("org.team");
  const user = await getSession();
  const members =
    user && !user.isDemo
      ? (
          await boFetch<{ members: Member[] }>("/org/members").catch(
            () => null,
          )
        )?.members ?? []
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
      <Card className="mt-6">
        <TeamPanel members={members} demo={user?.isDemo ?? true} meId={user?.id ?? 0} />
      </Card>
    </div>
  );
}
