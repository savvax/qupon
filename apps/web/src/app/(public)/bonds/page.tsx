import { StableText } from "@/components/i18n/StableLabel";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Amount } from "@/components/ui/Amount";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { Tabs } from "@/components/ui/Tabs";
import { cx } from "@/lib/ui/cx";
import {
  listActions,
  listPublicSeries,
  type ActionDTO,
  type SeriesDTO,
} from "@/lib/api";
import { boardStage, type BoardStage } from "@/lib/boardStage";
import { bpsToPercent, formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/request";

import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("bonds") };
}

export const dynamic = "force-dynamic";

/** The stage chip: a bond's life stage, not the raw chain status. Defaulted is the loudest state. */
const STAGE_STYLE: Record<BoardStage, string> = {
  inDefault: "bg-default text-white",
  voting: "bg-p50 text-p700",
  paying: "bg-p900 text-white",
  recordSoon: "border border-p900 bg-n0 text-p900",
  redeemed: "bg-n100 text-n600",
  live: "bg-p50 text-p700",
  issued: "bg-n100 text-n600",
};

/** Public bond board (task 1535): the curated showcase first, then every other public series. */
export default async function BondsPage() {
  const locale = (await getLocale()) as Locale;
  const [t, ts] = await Promise.all([
    getTranslations("bonds"),
    getTranslations("status"),
  ]);
  const series = await listPublicSeries();
  // Featured first (the registrar already sorts this way; sort here too so the board never depends on it).
  const ordered = [...series].sort(
    (a, b) => Number(b.featured ?? false) - Number(a.featured ?? false),
  );
  // The live action of every series that has one — the source of the life-stage chip.
  const openOf = new Map<string, ActionDTO | null>(
    await Promise.all(
      ordered
        .filter((s) => s.openAction)
        .map(async (s) => {
          const actions = await listActions(s.mint).catch(
            () => [] as ActionDTO[],
          );
          return [
            s.mint,
            actions.find((a) => a.pda === s.openAction) ??
              actions.find(
                (a) =>
                  !["Completed", "Cancelled", "Finalized"].includes(a.status),
              ) ??
              null,
          ] as const;
        }),
    ),
  );
  const active = ordered.filter(
    (s) => s.status === "Active" || s.status === "Retiring",
  );

  const stageChip = (s: SeriesDTO) => {
    const stage = boardStage(s, openOf.get(s.mint));
    return (
      <span
        className={cx(
          "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold whitespace-nowrap",
          STAGE_STYLE[stage],
        )}
      >
        {t(`stage.${stage}`)}
      </span>
    );
  };

  // The open action's next date (record while upcoming, payment once struck) — the scenario cue the
  // four showcase rows otherwise share (Opus review #12).
  const stageDate = (s: SeriesDTO) => {
    const open = openOf.get(s.mint);
    if (!open) return null;
    const at =
      Date.parse(open.recordAt) > Date.now() ? open.recordAt : open.paymentAt;
    return (
      <span className="num text-xs text-n600">{formatDate(at, locale)}</span>
    );
  };

  const columns: Column<SeriesDTO>[] = [
    {
      key: "bond",
      header: t("colBond"),
      render: (s) => (
        <Link
          href={`/bonds/${s.mint}`}
          className="font-bold text-g700 underline-offset-2 hover:underline after:absolute after:inset-0 after:content-['']"
        >
          {s.ticker}
          <span className="num ml-2 text-xs font-medium text-n500">
            {s.isin}
          </span>
        </Link>
      ),
    },
    {
      key: "face",
      header: t("colFace"),
      align: "right",
      render: (s) => (
        <Amount
          minor={s.faceValue.minor}
          currency={s.faceValue.currency}
          locale={locale}
        />
      ),
    },
    {
      key: "coupon",
      header: t("colCoupon"),
      align: "right",
      render: (s) => (
        <span className="num">{bpsToPercent(s.couponRateBps, locale)}</span>
      ),
    },
    {
      key: "next",
      header: t("colNextCoupon"),
      hideBelow: "md",
      render: (s) => (
        <span className="num">{formatDate(s.nextCouponDate, locale)}</span>
      ),
    },
    {
      key: "stage",
      header: t("colStage"),
      render: (s) => (
        <span className="flex flex-wrap items-center gap-1.5 max-sm:flex-col max-sm:items-start max-sm:gap-1">
          {stageChip(s)}
          {s.demoClock && <ProvenanceChip kind="demo" />}
          <span className="sr-only">{ts(s.status)}</span>
          {stageDate(s)}
        </span>
      ),
    },
  ];

  // Phone cards: three compact rows instead of label/value stacks (#12).
  const phoneRow = (s: SeriesDTO) => (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <Link
          href={`/bonds/${s.mint}`}
          className="min-w-0 truncate font-bold text-g700 underline-offset-2 hover:underline after:absolute after:inset-0 after:content-['']"
        >
          {s.ticker}
        </Link>
        <span className="num shrink-0 text-xs text-n600">{s.isin}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {stageChip(s)}
        {s.demoClock && <ProvenanceChip kind="demo" />}
        {stageDate(s)}
      </div>
      <div className="num text-sm text-n700">
        <Amount
          minor={s.faceValue.minor}
          currency={s.faceValue.currency}
          locale={locale}
        />
        {" · "}
        {bpsToPercent(s.couponRateBps, locale)}
        {" · "}
        {formatDate(s.nextCouponDate, locale)}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-[28px] font-bold leading-tight text-n900">
        <StableText>{t("title")}</StableText>
      </h1>
      <p className="mt-2 max-w-2xl text-n600">
        <StableText>{t("lead")}</StableText>
      </p>
      <div className="mt-6">
        {/* "All" first and default (live-sweep A91567-3): the completed redemption showcase (a Closed
            featured series) is the strongest on-chain evidence — it must not hide behind a chip. */}
        <Tabs
          items={[
            {
              value: "all",
              label: t("filterAll"),
              content: (
                <DataTable
                  columns={columns}
                  rows={ordered}
                  rowKey={(s) => s.mint}
                  empty={t("emptyActive")}
                  phoneRow={phoneRow}
                />
              ),
            },
            {
              value: "active",
              label: t("filterActive"),
              content: (
                <DataTable
                  columns={columns}
                  rows={active}
                  rowKey={(s) => s.mint}
                  empty={t("emptyActive")}
                  phoneRow={phoneRow}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
