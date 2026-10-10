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
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-14">
      <h1 className="text-title font-extrabold tracking-tight text-n900">
        <StableText>{t("title")}</StableText>
      </h1>
      <p className="mt-2 max-w-2xl text-base text-n600">
        <StableText>{t("lead")}</StableText>
      </p>
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
        <SignupForm />
        {/* The sequence the account unlocks, led by its steps (design language v2, task 91530). */}
        <aside className="h-full rounded-card border border-n200 bg-n0 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-n900">
            <StableText>{t("steps.title")}</StableText>
          </h2>
          <ol className="mt-5 space-y-5">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-4">
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-g50 text-sm font-bold text-g700 ring-1 ring-g200"
                >
                  {i + 1}
                </span>
                <div>
                  <div className="font-bold text-n900">
                    <StableText>{t(`steps.${s}.title`)}</StableText>
                  </div>
                  <p className="mt-0.5 text-sm text-n600">
                    <StableText>{t(`steps.${s}.text`)}</StableText>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 border-t border-n100 pt-4 text-xs text-n500">
            <StableText>{t("steps.note")}</StableText>
          </p>
        </aside>
      </div>
    </div>
  );
}
