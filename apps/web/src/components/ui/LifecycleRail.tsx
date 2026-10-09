import { useTranslations } from "next-intl";
import Link from "next/link";
import { Amount } from "@/components/ui/Amount";
import { formatDate } from "@/lib/format";
import { cx } from "@/lib/ui/cx";
import { type Locale } from "@/i18n/locale";

export type RailStatus =
  "done" | "live" | "upcoming" | "defaulted" | "cured" | "cancelled";

export type RailNode = {
  id: string;
  kind: "issue" | "coupon" | "meeting" | "call" | "redemption" | "maturity";
  /** "Coupon 2", "Maturity", "Bondholder meeting" (already translated). */
  title: string;
  /** ISO 8601 (record or payment date); shown in Almaty time. */
  date: string;
  status: RailStatus;
  /** Override of the status label (e.g. "Approved" for a meeting). */
  statusLabel?: string;
  /** Amount per bond. */
  amount?: { minor: string; currency: string };
  /** Short second line, e.g. "10% → 12%". */
  note?: string;
  txCount?: number;
  /** Where the stub leads (the action page, the explorer). */
  href?: string;
};

const STATUS_TEXT: Record<RailStatus, string> = {
  done: "text-g700",
  live: "text-n900",
  upcoming: "text-n500",
  defaulted: "text-default",
  cured: "text-cure-fg",
  cancelled: "text-n500",
};

function Mark({ status }: { status: RailStatus }) {
  const base = "grid size-6 shrink-0 place-items-center rounded-full";
  if (status === "done" || status === "cured")
    return (
      <span
        aria-hidden
        className={cx(
          base,
          status === "done" ? "bg-g600" : "bg-cure-fg",
          "text-white",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      </span>
    );
  if (status === "defaulted")
    return (
      <span aria-hidden className={cx(base, "bg-default text-white")}>
        <svg
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
        >
          <path d="M8 4v5M8 12h.01" />
        </svg>
      </span>
    );
  if (status === "live")
    return (
      <span
        aria-hidden
        className={cx(base, "qp-live border-2 border-g600 bg-n0")}
      >
        <span className="size-2 rounded-full bg-g600" />
      </span>
    );
  return (
    <span
      aria-hidden
      className={cx(base, "border-2 border-dashed border-n300 bg-n0")}
    />
  );
}

/**
 * The bond's life as a coupon sheet: one stub per event (issue, coupons, meetings, calls, maturity), divided by
 * perforations. Paid stubs carry a check and their transactions; the live one rings; defaulted ones are red.
 * Horizontal from 640 px (scrolls inside its frame when the life is long), a vertical list on phones.
 */
export function LifecycleRail({
  nodes,
  locale,
  title,
  className,
}: {
  nodes: RailNode[];
  locale: Locale;
  title?: string;
  className?: string;
}) {
  const t = useTranslations("kit.rail");
  const next = nodes.findIndex(
    (n) => n.status === "live" || n.status === "upcoming",
  );
  return (
    <section
      aria-label={title ?? t("title")}
      className={cx(
        "rounded-card border border-n200 bg-n0 [--qp-sheet-bg:var(--color-n50)]",
        className,
      )}
    >
      {title !== "" && (
        <h2 className="px-4 pt-4 text-base font-bold sm:px-5">
          {title ?? t("title")}
        </h2>
      )}
      <ol className="flex flex-col overflow-x-auto px-4 py-3 [scrollbar-width:thin] sm:flex-row sm:px-5 sm:py-5">
        {nodes.map((n, i) => {
          const body = (
            <>
              <div className="flex items-center gap-2">
                <Mark status={n.status} />
                <span className="min-w-0 font-bold leading-tight text-balance text-n900">
                  {n.title}
                </span>
                {i === next && n.status !== "live" && (
                  <span className="ml-auto rounded-full bg-p900 px-1.5 text-micro font-bold text-white sm:hidden">
                    {t("next")}
                  </span>
                )}
              </div>
              <div className="num mt-2 text-sm text-n700">
                {formatDate(n.date, locale)}
              </div>
              {n.amount && (
                <div className="mt-0.5 text-sm">
                  <Amount
                    minor={n.amount.minor}
                    currency={n.amount.currency}
                    locale={locale}
                    className="font-semibold text-n900"
                  />{" "}
                  <span className="text-xs text-n500">{t("perBond")}</span>
                </div>
              )}
              {n.note && (
                <div className="num mt-0.5 text-sm font-semibold text-n900">
                  {n.note}
                </div>
              )}
              <div
                className={cx("mt-2 text-xs font-bold", STATUS_TEXT[n.status])}
              >
                {n.statusLabel ?? t(`status.${n.status}`)}
              </div>
              <div className="mt-0.5 text-xs text-n500">
                {n.txCount
                  ? t("txs", { count: n.txCount })
                  : n.status === "upcoming"
                    ? t("projected")
                    : " "}
              </div>
            </>
          );
          return (
            <li
              key={n.id}
              className={cx(
                "relative min-w-0 py-3 sm:min-w-[148px] sm:flex-1 sm:px-4 sm:py-1",
                i > 0 && "qp-perf",
                n.status === "defaulted" && "sm:bg-err-bg/60",
              )}
            >
              {i === next && n.status !== "live" && (
                <span className="absolute -top-3 left-4 hidden rounded-full bg-p900 px-1.5 text-micro font-bold text-white sm:block">
                  {t("next")}
                </span>
              )}
              {n.href ? (
                <Link
                  href={n.href}
                  className="block rounded-btn transition-colors hover:bg-n50 sm:-mx-2 sm:px-2"
                >
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
