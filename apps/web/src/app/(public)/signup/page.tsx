import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StableText } from "@/components/i18n/StableLabel";
import { ROLE_HOME, getSession } from "@/lib/session";
import { SignupForm } from "./SignupForm";

export async function generateMetadata() {
  const t = await getTranslations("account.signup");
  return { title: `${t("title")} · Qupon` };
}

const STEPS = ["account", "wallet", "kyc", "invest"] as const;

/** Investor sign-up (spec §5.3, task 802): open on every network; signed-in users go to their home. */
export default async function SignupPage() {
  const user = await getSession();
  if (user) redirect(ROLE_HOME[user.role]);
  const t = await getTranslations("account.signup");
  return (
    <div className="mx-auto grid max-w-[1100px] gap-6 px-4 py-8 sm:px-6 sm:py-14 lg:grid-cols-[1fr_1.15fr] lg:items-stretch">
      <SignupForm />
      <aside className="relative h-full overflow-hidden rounded-hero bg-p900 p-6 text-white sm:p-8">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(90%_80%_at_100%_0%,var(--color-p500)_0%,transparent_60%)] opacity-60"
        />
        <div className="relative">
          <h2 className="text-2xl font-extrabold tracking-tight">
            <StableText>{t("steps.title")}</StableText>
          </h2>
          <ol className="mt-6 space-y-5">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold ring-1 ring-white/20">
                  {i + 1}
                </span>
                <div>
                  <div className="font-bold">
                    <StableText>{t(`steps.${s}.title`)}</StableText>
                  </div>
                  <p className="mt-0.5 text-sm text-white/70">
                    <StableText>{t(`steps.${s}.text`)}</StableText>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-white/60">
            <StableText>{t("steps.note")}</StableText>
          </p>
        </div>
      </aside>
    </div>
  );
}
