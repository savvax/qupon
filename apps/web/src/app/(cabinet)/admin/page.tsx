import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Kpi } from "@/components/ui/Kpi";
import { listActions, listSeries } from "@/lib/api";
import { boFetch } from "@/lib/bo";
import { metaTitle } from "@/lib/meta";
import type { SystemHealth } from "./system/SystemPanel";

/** Statuses that still need operator attention (mirrors the registrar dashboard). */
const OPEN = new Set([
  "Announced",
  "RecordStruck",
  "SnapshotComplete",
  "Funded",
  "Settling",
  "Retiring",
  "VotingOpen",
]);

type UserRow = { role: string };

export async function generateMetadata() {
  return { title: await metaTitle("admin") };
}

/** Admin overview (platform v2 §5.2): KPI cards, each linking to its page. */
export default async function AdminOverviewPage() {
  const t = await getTranslations("admin.overview");
  const roleT = await getTranslations("cabinet.roles");

  // Each card renders even when its source is down; the KYC queue appears once
  // task 803 ships GET /registrar/kyc — until then the card shows "unavailable".
  const [usersRes, seriesRes, systemRes, kycRes, publicSeries] =
    await Promise.all([
      boFetch<{ users: UserRow[] }>("admin/users").catch(() => null),
      boFetch<{ series: unknown[] }>("admin/series").catch(() => null),
      boFetch<SystemHealth>("admin/system").catch(() => null),
      boFetch<{ applications: unknown[] }>(
        "registrar/kyc?status=pending",
      ).catch(() => null),
      listSeries().catch(() => null),
    ]);

  const actions = publicSeries
    ? (
        await Promise.all(
          publicSeries.map((s) => listActions(s.mint).catch(() => [])),
        )
      ).flat()
    : [];
  const openActions = actions.filter((a) => OPEN.has(a.status)).length;

  const byRole = new Map<string, number>();
  for (const u of usersRes?.users ?? [])
    byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1);
  const usersHint =
    usersRes === null
      ? null
      : [...byRole.entries()]
          .map(([role, n]) => `${roleT.has(role) ? roleT(role) : role} ${n}`)
          .join(" · ");

  const lowOps = systemRes?.operators.filter((o) => o.low) ?? [];
  const na = t("kpi.unavailable");

  const cards = [
    {
      href: "/admin/users",
      label: t("kpi.users"),
      value: usersRes === null ? na : usersRes.users.length,
      hint: usersHint,
    },
    {
      href: "/registrar/kyc",
      label: t("kpi.pendingKyc"),
      value: kycRes === null ? na : kycRes.applications.length,
      hint: t("kpi.pendingKycHint"),
    },
    {
      href: "/admin/series",
      label: t("kpi.series"),
      value: seriesRes === null ? na : seriesRes.series.length,
      hint: null,
    },
    {
      href: "/registrar/actions",
      label: t("kpi.openActions"),
      value: openActions,
      hint: null,
    },
    {
      href: "/admin/system",
      label: t("kpi.lowOperators"),
      value: systemRes === null ? na : lowOps.length,
      hint:
        systemRes === null
          ? null
          : lowOps.length > 0
            ? t("kpi.lowOperatorsHint")
            : t("kpi.allFunded"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 max-w-xl text-sm text-n600">{t("lead")}</p>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.href + c.label}
            href={c.href}
            className="rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-p500 [&>div]:transition-colors [&>div]:hover:border-p300"
          >
            <Kpi label={c.label} value={c.value} hint={c.hint} />
          </Link>
        ))}
      </div>
    </div>
  );
}
