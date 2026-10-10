import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StableText } from "@/components/i18n/StableLabel";
import { Button } from "@/components/ui/Button";
import { safeNext } from "@/lib/boClient";
import { ROLE_HOME, getSession } from "@/lib/session";
import { DemoPanel, SignInCard } from "./LoginForm";
import { metaTitle } from "@/lib/meta";
import { getNetwork } from "@/lib/network";

export async function generateMetadata() {
  return { title: await metaTitle("login") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; choose?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const user = await getSession();
  // ?choose=1 (the landing's demo buttons): show the role choice even to a signed-in visitor — otherwise
  // "Open the demo" always landed in whatever cabinet the last session had (user report 2026-10-06)
  if (user && !params.choose) redirect(next ?? ROLE_HOME[user.role]);
  const { demoLogin } = await getNetwork();
  const t = await getTranslations("login");
  const roles = await getTranslations("cabinet.roles");
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-14">
      {/* The demo identities are the primary path: h1 and lead name them first (design language v2, task 91530). */}
      <h1 className="text-title font-extrabold tracking-tight text-n900">
        <StableText>{t("title")}</StableText>
      </h1>
      <p className="mt-2 max-w-2xl text-base text-n600">
        <StableText>{t("lead")}</StableText>
      </p>
      {user && (
        <div className="mt-6 flex flex-col gap-3 rounded-card border border-g200 bg-g50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-n800">
            {t("signedInAs", { name: user.name, role: roles(user.role) })}
          </p>
          <Button asChild size="sm" className="shrink-0">
            <Link href={ROLE_HOME[user.role]}>{t("continue")}</Link>
          </Button>
        </div>
      )}
      <div
        className={
          demoLogin
            ? "mt-8 grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]"
            : "mt-8 grid max-w-xl gap-6"
        }
      >
        {demoLogin && <DemoPanel next={next} />}
        <SignInCard next={next} />
      </div>
    </div>
  );
}
