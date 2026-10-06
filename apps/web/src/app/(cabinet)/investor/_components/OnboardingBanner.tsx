import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/shell/icons";
import { Button } from "@/components/ui/Button";
import { boFetch } from "@/lib/bo";
import type { KycApplication } from "@/lib/kyc";
import { getSession } from "@/lib/session";

/**
 * Next step for a self-registered investor until verification is approved (task 802): link a wallet →
 * apply for KYC; then "under review" / "rejected" with a way back to the application.
 */
export async function OnboardingBanner() {
  const s = await getSession();
  if (!s || s.role !== "investor" || s.isDemo) return null;
  const kyc = await boFetch<{ application: KycApplication | null }>(
    "/me/kyc",
  ).catch(() => null);
  if (!kyc) return null;
  const state = kyc.application?.status ?? "none";
  if (state === "approved") return null;
  const t = await getTranslations("account.onboarding");
  return (
    <section
      aria-labelledby="onboarding"
      className="mb-6 flex flex-col gap-4 rounded-card border border-g200 bg-g50 p-5 sm:flex-row sm:items-center"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-g600 text-white">
        <Icon name="shield" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="onboarding" className="font-bold text-n900">
          {t(`${state}.title`)}
        </h2>
        <p className="mt-0.5 text-sm text-n700">{t(`${state}.text`)}</p>
      </div>
      <Button asChild className="shrink-0">
        <Link href="/investor/kyc">{t(`${state}.cta`)}</Link>
      </Button>
    </section>
  );
}
