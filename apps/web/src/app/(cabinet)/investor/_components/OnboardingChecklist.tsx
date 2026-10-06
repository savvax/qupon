import { getTranslations } from "next-intl/server";
import { boFetch } from "@/lib/bo";
import { getNetwork } from "@/lib/network";
import { getSession } from "@/lib/session";
import { FaucetButtons, type FaucetAsset } from "./FaucetButtons";

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

/**
 * Investor onboarding checklist (platform v2 §5.3, task 808): five steps from sign-up to the
 * first subscription, devnet only — on mainnet there is no test cash, so no checklist either.
 */
export async function OnboardingChecklist() {
  const s = await getSession();
  if (!s || s.role !== "investor" || s.isDemo) return null;
  if ((await getNetwork()).mainnet) return null;
  const ob = await boFetch<OnboardingState>("/me/onboarding").catch(() => null);
  if (!ob) return null;
  const t = await getTranslations("onboarding");
  const allDone = KEYS.every((k) => ob.checklist[k]);
  return (
    <section
      aria-labelledby="onboarding-checklist"
      className="mb-6 rounded-card border border-g200 bg-g50"
    >
      <div className="p-5 pb-0">
        <h2 id="onboarding-checklist" className="font-bold text-n900">
          {t("title")}
        </h2>
        <p className="mt-0.5 text-sm text-n700">{t("lead")}</p>
      </div>
      <ol className="flex flex-col gap-1 p-3">
        {KEYS.map((k, i) => {
          const done = ob.checklist[k];
          return (
            <li
              key={k}
              data-key={k}
              data-done={done}
              className="flex flex-wrap items-center gap-3 rounded-card px-2 py-2"
            >
              <span
                aria-hidden
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  done ? "bg-g600 text-white" : "bg-n200 text-n600"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-semibold ${done ? "text-n900" : "text-n700"}`}
                >
                  {t(`steps.${k}.label`)}
                </span>
                <span className="block text-xs text-n500">
                  {t(`steps.${k}.hint`)}
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
            </li>
          );
        })}
      </ol>
      {allDone && (
        <p className="border-t border-g200 px-5 py-3 text-sm font-semibold text-g700">
          {t("allDone")}
        </p>
      )}
    </section>
  );
}
