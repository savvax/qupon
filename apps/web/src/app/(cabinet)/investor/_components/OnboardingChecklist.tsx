import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { boFetch } from "@/lib/bo";
import { getNetwork } from "@/lib/network";
import type { KycApplication } from "@/lib/kyc";
import { getSession } from "@/lib/session";
import { FaucetButtons, type FaucetAsset } from "./FaucetButtons";
import { OnboardingBanner } from "./OnboardingBanner";

/** GET /me/onboarding (task 808): the checklist state + the faucet-eligible assets. */
export type OnboardingState = {
  checklist: {
    account: boolean;
    walletLinked: boolean;
    kycApproved: boolean;
    testCashReceived: boolean;
    subscribed: boolean;
  };
  faucetAssets: FaucetAsset[];
};

const KEYS = [
  "account",
  "walletLinked",
  "kycApproved",
  "testCashReceived",
  "subscribed",
] as const;

// Where each pending step is done (the faucet row acts in place).
const ACTION: Partial<Record<(typeof KEYS)[number], string>> = {
  walletLinked: "/investor/kyc",
  kycApproved: "/investor/kyc",
  subscribed: "/investor/placement",
};

/**
 * The one onboarding block on /investor (tasks 808 + 91109): on devnet the five-step checklist from sign-up to the
 * first subscription — the current step is highlighted with its action, the KYC row shows the application's state,
 * a bar shows progress, and a finished checklist shrinks to one line. Where there is no checklist (mainnet, or the
 * onboarding API is down) the shorter KYC banner stands in.
 */
export async function OnboardingChecklist() {
  const s = await getSession();
  if (!s || s.role !== "investor" || s.isDemo) return null;
  if ((await getNetwork()).mainnet) return <OnboardingBanner />;
  const [ob, kyc] = await Promise.all([
    boFetch<OnboardingState>("/me/onboarding").catch(() => null),
    boFetch<{ application: KycApplication | null }>("/me/kyc").catch(
      () => null,
    ),
  ]);
  if (!ob) return <OnboardingBanner />;
  const t = await getTranslations("onboarding");
  const done = KEYS.filter((k) => ob.checklist[k]).length;
  const current = KEYS.find((k) => !ob.checklist[k]);
  const kycState = kyc?.application?.status ?? "none";

  if (!current)
    return (
      <p className="mb-6 flex items-center gap-3 rounded-card border border-g200 bg-g50 px-5 py-3 text-sm font-semibold text-g700">
        <span
          aria-hidden
          className="animate-qp-pop grid size-6 place-items-center rounded-full bg-g600 text-white"
        >
          ✓
        </span>
        {t("allDone")}
      </p>
    );

  return (
    <section
      aria-labelledby="onboarding-checklist"
      className="mb-6 overflow-hidden rounded-card border border-g200 bg-g50"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 p-5 pb-3">
        <div className="min-w-0">
          <h2 id="onboarding-checklist" className="font-bold text-n900">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-sm text-n700">{t("lead")}</p>
        </div>
        <span className="num shrink-0 text-xs font-semibold text-g700">
          {t("progress", { done, total: KEYS.length })}
        </span>
      </div>
      <div
        className="mx-5 h-1.5 overflow-hidden rounded-full bg-g100"
        aria-hidden
      >
        <div
          className="qp-bar h-full rounded-full bg-g600"
          style={{ scale: `${done / KEYS.length} 1` }}
        />
      </div>
      <ol className="flex flex-col gap-1 p-3">
        {KEYS.map((k, i) => {
          const isDone = ob.checklist[k];
          const isCurrent = k === current;
          const hint =
            k === "kycApproved" && !isDone && kycState !== "none"
              ? t(`kyc.${kycState}`)
              : t(`steps.${k}.hint`);
          const action =
            k === "kycApproved"
              ? t(`actions.kyc.${kycState}`)
              : k === "walletLinked"
                ? t("actions.wallet")
                : t("actions.subscribe");
          return (
            <li
              key={k}
              data-key={k}
              data-done={isDone}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex flex-wrap items-center gap-3 rounded-card px-2 py-2 ${
                isCurrent
                  ? "bg-n0 shadow-[0_1px_2px_rgba(18,26,22,.06)] ring-1 ring-g200"
                  : ""
              }`}
            >
              <span
                aria-hidden
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  isDone
                    ? "bg-g600 text-white"
                    : isCurrent
                      ? "animate-qp-ring bg-n0 text-g700 ring-2 ring-g600 ring-inset"
                      : "bg-n200 text-n600"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-semibold ${isDone ? "text-n900" : "text-n700"}`}
                >
                  {t(`steps.${k}.label`)}
                </span>
                <span
                  className={`block text-xs ${
                    k === "kycApproved" && kycState === "rejected" && !isDone
                      ? "text-err-fg"
                      : "text-n500"
                  }`}
                >
                  {hint}
                </span>
              </span>
              {k === "testCashReceived" && (
                <span className="flex flex-col items-start gap-1">
                  <FaucetButtons assets={ob.faucetAssets} />
                  <span className="text-[11px] text-n400">
                    {t("faucet.note")}
                  </span>
                </span>
              )}
              {isCurrent && ACTION[k] && (
                <Button asChild size="sm">
                  <Link href={ACTION[k]!}>{action}</Link>
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
