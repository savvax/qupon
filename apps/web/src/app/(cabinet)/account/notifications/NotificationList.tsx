"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SeriesDTO } from "@/lib/api";
import { boPost } from "@/lib/boClient";
import { formatDateTime } from "@/lib/format";
import {
  NOTIFICATIONS_CHANGED,
  notice,
  seriesIndex,
  type NotificationDTO,
} from "@/lib/notifications";
import { cx } from "@/lib/ui/cx";

const TONE_DOT = {
  info: "bg-p500",
  success: "bg-g600",
  warn: "bg-warn-fg",
  danger: "bg-err-fg",
} as const;

export function NotificationList({
  initial,
  series,
}: {
  initial: NotificationDTO[];
  series: SeriesDTO[];
}) {
  const t = useTranslations("notify");
  const locale = useLocale();
  const idx = useMemo(() => seriesIndex(series), [series]);
  const [items, setItems] = useState(initial);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const unread = items.filter((n) => !n.readAt).length;
  const shown = unreadOnly ? items.filter((n) => !n.readAt) : items;
  const now = () => Math.floor(Date.now() / 1000);

  const markAll = async () => {
    await boPost("me/notifications/read", { all: true }).catch(() => null);
    setItems((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? now() })));
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  };
  const markOne = (id: number) => {
    void boPost("me/notifications/read", { ids: [id] }).catch(() => null);
    setItems((xs) =>
      xs.map((x) => (x.id === id ? { ...x, readAt: x.readAt ?? now() } : x)),
    );
  };

  if (items.length === 0)
    return <EmptyState title={t("empty")} body={t("emptyBody")} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-n700">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="size-4 accent-g600"
          />
          {t("unreadOnly", { count: unread })}
        </label>
        <Button
          variant="secondary"
          size="sm"
          disabled={unread === 0}
          onClick={() => void markAll()}
        >
          {t("markAll")}
        </Button>
      </div>
      <Stagger
        as="ul"
        className="divide-y divide-n100 overflow-hidden rounded-card border border-n200 bg-n0"
      >
        {shown.map((n) => {
          const v = notice(n, idx);
          return (
            <StaggerItem as="li" key={n.id}>
              <Link
                href={v.href}
                onClick={() => markOne(n.id)}
                className={cx(
                  "flex gap-3 px-4 py-4 transition-colors hover:bg-n50 sm:px-5",
                  !n.readAt && "bg-g50/40",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "mt-1.5 size-2.5 shrink-0 rounded-full",
                    n.readAt ? "bg-n200" : TONE_DOT[v.tone],
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-n900">
                    {t(`kinds.${v.kind}.title`, v.values)}
                  </span>
                  <span className="mt-0.5 block text-sm text-n600">
                    {t(`kinds.${v.kind}.body`, v.values)}
                  </span>
                  <span className="num mt-1 block text-xs text-n500">
                    {formatDateTime(
                      new Date(n.createdAt * 1000).toISOString(),
                      locale,
                    )}
                  </span>
                </span>
                {!n.readAt && (
                  <span className="shrink-0 self-start rounded-full bg-g100 px-2 py-0.5 text-[11px] font-bold text-g700">
                    {t("new")}
                  </span>
                )}
              </Link>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}
