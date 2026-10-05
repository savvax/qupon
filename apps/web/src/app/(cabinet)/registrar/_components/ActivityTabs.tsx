"use client";

import { useTranslations } from "next-intl";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Tabs } from "@/components/ui/Tabs";
import type { ActivityLike } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/** One operator write (Go GET /registrar/audit): who ran what, with which result. */
export type AuditItem = {
  id: number;
  ts: number;
  userId: number;
  role: string;
  route: string;
  params?: Record<string, unknown> | null;
  ok: boolean;
  detail: string;
  signatures?: string[] | null;
};

const almaty = (unixSeconds: number) => (
  <span className="num text-xs whitespace-nowrap">
    {formatDateTime(new Date(unixSeconds * 1000).toISOString())}
  </span>
);

const dash = "—";

/** Activity page tabs: on-chain events (public feed) and the operator audit trail. */
export function ActivityTabs({
  events,
  audit,
  tickers = {},
}: {
  events: ActivityLike[];
  audit: AuditItem[];
  /** mint → ticker, so rows name the series instead of showing its address */
  tickers?: Record<string, string>;
}) {
  const t = useTranslations("registrar.activity");
  const roles = useTranslations("cabinet.roles");

  const eventCols: Column<ActivityLike>[] = [
    { key: "ts", header: t("time"), render: (r) => almaty(r.ts) },
    {
      key: "kind",
      header: t("kind"),
      render: (r) => <Badge status={r.kind} />,
    },
    {
      key: "series",
      header: t("series"),
      render: (r) =>
        r.seriesMint ? (
          tickers[r.seriesMint] ? (
            <span className="font-semibold text-n900" title={r.seriesMint}>
              {tickers[r.seriesMint]}
            </span>
          ) : (
            <Address value={r.seriesMint} />
          )
        ) : (
          dash
        ),
    },
    {
      key: "sig",
      header: t("tx"),
      render: (r) => (r.sig ? <Address value={r.sig} kind="tx" /> : dash),
    },
  ];

  const auditCols: Column<AuditItem>[] = [
    { key: "ts", header: t("time"), render: (r) => almaty(r.ts) },
    {
      key: "user",
      header: t("user"),
      render: (r) => (
        <span className="num text-xs">
          #{r.userId}
          <span className="ml-2 text-n500">
            {roles.has(r.role) ? roles(r.role) : r.role}
          </span>
        </span>
      ),
    },
    {
      key: "route",
      header: t("route"),
      render: (r) => <span className="text-xs break-all">{r.route}</span>,
    },
    {
      key: "ok",
      header: t("result"),
      render: (r) =>
        r.ok ? (
          <Badge tone="success">{t("ok")}</Badge>
        ) : (
          <Badge tone="danger">{t("failed")}</Badge>
        ),
    },
    {
      key: "sigs",
      header: t("signatures"),
      render: (r) =>
        r.signatures && r.signatures.length > 0 ? (
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {r.signatures.map((s) => (
              <Address key={s} value={s} kind="tx" />
            ))}
          </span>
        ) : (
          dash
        ),
    },
  ];

  return (
    <Tabs
      items={[
        {
          value: "onchain",
          label: t("onchain"),
          content: (
            <DataTable
              columns={eventCols}
              rows={events}
              rowKey={(r) => String(r.id)}
              empty={t("emptyEvents")}
            />
          ),
        },
        {
          value: "audit",
          label: t("audit"),
          content: (
            <DataTable
              columns={auditCols}
              rows={audit}
              rowKey={(r) => String(r.id)}
              empty={t("emptyAudit")}
            />
          ),
        },
      ]}
    />
  );
}
