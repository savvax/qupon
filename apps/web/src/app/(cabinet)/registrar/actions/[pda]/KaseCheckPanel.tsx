import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import type { KaseCheck } from "@/lib/api";

/**
 * "KASE schedule check" card (platform v2 §5.5): kase.kz's fixation date for
 * the coupon period vs the on-chain record date — ✓ match or a mismatch.
 * `check === null` means kase.kz (or the API) was unreachable.
 */
export function KaseCheckPanel({ check }: { check: KaseCheck | null }) {
  const t = useTranslations("kase.scheduleCheck");
  return (
    <section className="rounded-card border border-n200 bg-n0 p-5">
      <h3 className="font-bold">{t("title")}</h3>
      <p className="mt-1 text-sm text-n600">{t("lead")}</p>
      {!check || check.status === "error" ? (
        <p className="mt-3 text-sm text-warn-fg">{t("unavailable")}</p>
      ) : check.status === "ok" ? (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge tone={check.match ? "success" : "danger"}>
              {check.match ? t("match") : t("mismatch")}
            </Badge>
            {check.stale && (
              <span className="text-xs text-warn-fg">
                {t("stale", { date: check.fetchedAt ?? "" })}
              </span>
            )}
          </div>
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-n500">{t("period")}</dt>
              <dd className="num">
                {check.period?.start} – {check.period?.end}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-n500">{t("recordDate")}</dt>
              <dd className="num">{check.recordDate}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-n500">{t("fixation")}</dt>
              <dd className="num font-semibold">{check.kaseFixation}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-3 text-sm text-n600">
          {check.status === "no_ticker"
            ? t("noTicker")
            : check.status === "no_period"
              ? t("noPeriod")
              : t("noSchedule")}
        </p>
      )}
    </section>
  );
}
