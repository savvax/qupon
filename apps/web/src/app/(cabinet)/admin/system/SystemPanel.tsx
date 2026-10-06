"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDateTime } from "@/lib/format";

/** Shape of GET /admin/system (internal/api/system.go); omitted fields are absent. */
export type SystemHealth = {
  network: string;
  rpc: { ok: boolean; latencyMs: number; slot: number };
  operators: { name: string; address: string; sol: number; low: boolean }[];
  executor: { running: number; queued: number; maxConcurrent: number };
  scheduler: { enabled: boolean; lastTick?: string };
  ingest: { lastSlot: number; lagSlots: number };
  kase: { entries: number; lastFetch?: string; lastError?: string };
  demo: { writesPerHour: number; seriesPerDay: number };
};

const REFRESH_MS = 15_000; // spec §5.2: refresh every 15 s

/** Field label + value + status dot: one row of a health card. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-n500">{label}</dt>
      <dd className="num min-w-0 truncate font-semibold">{value}</dd>
    </div>
  );
}

export function SystemPanel() {
  const t = useTranslations("admin.system");
  const [data, setData] = useState<SystemHealth | null>(null);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/bo-get/admin/system");
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as SystemHealth);
      setUpdatedAt(new Date());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (!data) {
    return failed ? (
      <Card>
        <p className="text-sm font-semibold">{t("unavailable")}</p>
        <Button className="mt-3" size="sm" onClick={() => void load()}>
          {t("retry")}
        </Button>
      </Card>
    ) : (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-4 w-16" />
            <Skeleton className="mt-2 h-4 w-20" />
          </Card>
        ))}
        <p className="sr-only" aria-live="polite">
          {t("loading")}
        </p>
      </div>
    );
  }

  const opName = (name: string) =>
    t.has(`ops.${name}`) ? t(`ops.${name}`) : name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-n500" aria-live="polite">
          {updatedAt
            ? t("updated", { time: formatDateTime(updatedAt.toISOString()) })
            : t("loading")}
        </p>
        <Button size="sm" loading={busy} onClick={() => void load()}>
          {t("refresh")}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <h2 className="text-base font-bold">{t("rpc.title")}</h2>
          <div className="mt-2">
            <Badge tone={data.rpc.ok ? "success" : "danger"}>
              {data.rpc.ok ? t("rpc.ok") : t("rpc.down")}
            </Badge>
          </div>
          <dl className="mt-3 flex flex-col gap-1.5">
            <Row
              label={t("rpc.latency")}
              value={t("rpc.ms", { n: data.rpc.latencyMs })}
            />
            <Row label={t("rpc.slot")} value={data.rpc.slot.toLocaleString()} />
            <Row label={t("network")} value={data.network} />
          </dl>
        </Card>

        <Card>
          <h2 className="text-base font-bold">{t("ops.title")}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {data.operators.map((o) => (
              <li
                key={o.address}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="font-semibold">{opName(o.name)}</span>
                <Address value={o.address} />
                {o.low && <Badge tone="danger">{t("ops.low")}</Badge>}
                <span className="num ml-auto text-n500">
                  {t("ops.sol", { n: o.sol.toFixed(3) })}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-base font-bold">{t("executor.title")}</h2>
          <div className="mt-2">
            <Badge tone={data.executor.queued > 0 ? "warn" : "success"}>
              {data.executor.queued > 0
                ? t("executor.queued")
                : t("executor.running")}
            </Badge>
          </div>
          <dl className="mt-3 flex flex-col gap-1.5">
            <Row label={t("executor.running")} value={data.executor.running} />
            <Row label={t("executor.queued")} value={data.executor.queued} />
            <Row
              label={t("executor.capacity")}
              value={data.executor.maxConcurrent}
            />
          </dl>
        </Card>

        <Card>
          <h2 className="text-base font-bold">{t("scheduler.title")}</h2>
          <div className="mt-2">
            <Badge tone={data.scheduler.enabled ? "success" : "neutral"}>
              {data.scheduler.enabled
                ? t("scheduler.enabled")
                : t("scheduler.disabled")}
            </Badge>
          </div>
          <dl className="mt-3 flex flex-col gap-1.5">
            <Row
              label={t("scheduler.lastTick")}
              value={
                data.scheduler.lastTick
                  ? formatDateTime(data.scheduler.lastTick)
                  : t("scheduler.never")
              }
            />
          </dl>
        </Card>

        <Card>
          <h2 className="text-base font-bold">{t("ingest.title")}</h2>
          <div className="mt-2">
            <Badge tone={data.ingest.lastSlot > 0 ? "success" : "neutral"}>
              {data.ingest.lastSlot > 0
                ? t("ingest.lastSlot")
                : t("scheduler.never")}
            </Badge>
          </div>
          <dl className="mt-3 flex flex-col gap-1.5">
            <Row
              label={t("ingest.lastSlot")}
              value={data.ingest.lastSlot.toLocaleString()}
            />
            <Row
              label={t("ingest.lag")}
              value={t("ingest.slots", { n: data.ingest.lagSlots })}
            />
          </dl>
        </Card>

        <Card>
          <h2 className="text-base font-bold">{t("kase.title")}</h2>
          <div className="mt-2">
            <Badge tone={data.kase.lastError ? "warn" : "success"}>
              {data.kase.lastError ? t("kase.lastError") : t("kase.entries")}
            </Badge>
          </div>
          <dl className="mt-3 flex flex-col gap-1.5">
            <Row
              label={t("kase.entries")}
              value={data.kase.entries.toLocaleString()}
            />
            <Row
              label={t("kase.lastFetch")}
              value={
                data.kase.lastFetch
                  ? formatDateTime(data.kase.lastFetch)
                  : t("kase.never")
              }
            />
            {data.kase.lastError && (
              <Row label={t("kase.lastError")} value={data.kase.lastError} />
            )}
          </dl>
        </Card>
      </div>

      <Card>
        <h2 className="text-base font-bold">{t("demo.title")}</h2>
        <dl className="mt-3 flex flex-col gap-1.5">
          <Row label={t("demo.writes")} value={data.demo.writesPerHour} />
          <Row label={t("demo.series")} value={data.demo.seriesPerDay} />
        </dl>
      </Card>
    </div>
  );
}
