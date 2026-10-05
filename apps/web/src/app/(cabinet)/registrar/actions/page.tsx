import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Tabs } from "@/components/ui/Tabs";
import {
  listActions,
  listSeries,
  type ActionDTO,
  type SeriesDTO,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import { KIND_TONE } from "@/lib/ui/badge";

export const dynamic = "force-dynamic";

type Row = { a: ActionDTO; s: SeriesDTO };
const DONE = ["Completed", "Cancelled"];

/** Every corporate action across the registry, newest record date first. */
export default async function RegistrarActions() {
  const [t, ts, tk] = await Promise.all([
    getTranslations("action"),
    getTranslations("status"),
    getTranslations("landing.kinds"),
  ]);
  const series = await listSeries().catch(() => [] as SeriesDTO[]);
  const rows: Row[] = (
    await Promise.all(
      series.map((s) =>
        listActions(s.mint)
          .then((as) => as.map((a) => ({ a, s })))
          .catch(() => [] as Row[]),
      ),
    )
  )
    .flat()
    .sort((x, y) => y.a.recordAt.localeCompare(x.a.recordAt));

  const cols: Column<Row>[] = [
    {
      key: "action",
      header: t("list.action"),
      render: ({ a, s }) => (
        <Link href={`/registrar/actions/${a.pda}`} className="group block">
          <span className="font-bold text-g700 group-hover:underline">
            {tk.has(a.kind) ? tk(a.kind) : a.kind} · {s.ticker}
          </span>
          <span className="num mt-0.5 block text-xs text-n500">{a.corpId}</span>
        </Link>
      ),
    },
    {
      key: "kind",
      header: t("list.kind"),
      hideBelow: "md",
      render: ({ a }) => (
        <Badge tone={KIND_TONE[a.kind] ?? "neutral"}>{a.kind}</Badge>
      ),
    },
    {
      key: "record",
      header: t("facts.record"),
      render: ({ a }) => <span className="num">{formatDate(a.recordAt)}</span>,
    },
    {
      key: "payment",
      header: t("facts.payment"),
      hideBelow: "md",
      render: ({ a }) => <span className="num">{formatDate(a.paymentAt)}</span>,
    },
    {
      key: "status",
      header: t("ent.status"),
      render: ({ a }) => (
        <Badge status={a.status}>
          {ts.has(a.status) ? ts(a.status) : a.status}
        </Badge>
      ),
    },
  ];
  const table = (list: Row[]) => (
    <DataTable
      columns={cols}
      rows={list}
      rowKey={(r) => r.a.pda}
      empty={t("list.empty")}
    />
  );
  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {t("list.title")}
      </h1>
      <p className="mt-1 text-n600">{t("list.lead")}</p>
      <div className="mt-6">
        <Tabs
          defaultValue="open"
          items={[
            {
              value: "open",
              label: t("list.open"),
              content: table(rows.filter((r) => !DONE.includes(r.a.status))),
            },
            {
              value: "done",
              label: t("list.done"),
              content: table(rows.filter((r) => DONE.includes(r.a.status))),
            },
            { value: "all", label: t("list.all"), content: table(rows) },
          ]}
        />
      </div>
    </div>
  );
}
