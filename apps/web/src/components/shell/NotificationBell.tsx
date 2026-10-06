"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { listSeries } from "@/lib/api";
import { boPost } from "@/lib/boClient";
import {
  NOTIFICATIONS_CHANGED,
  ago,
  notice,
  seriesIndex,
  type NotificationDTO,
  type SeriesRef,
} from "@/lib/notifications";
import { cx } from "@/lib/ui/cx";
import { Icon } from "./icons";

const POLL_MS = 30_000;
const TONE_DOT = {
  info: "bg-p500",
  success: "bg-g600",
  warn: "bg-warn-fg",
  danger: "bg-err-fg",
} as const;

/**
 * Top-bar bell (task 805): unread count polled every 30 s — the badge pops when it rises (task 91102), never on
 * the first load — and a panel with the latest notifications, "mark all as read" and a link to the full list.
 */
export function NotificationBell() {
  const t = useTranslations("notify");
  const locale = useLocale();
  const [count, setCount] = useState(0);
  const [pop, setPop] = useState(0);
  const prev = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const [idx, setIdx] = useState<Map<string, SeriesRef>>(new Map());
  const box = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    const res = await fetch("/api/bo-get/me/notifications/count").catch(
      () => null,
    );
    if (!res?.ok) return;
    const { unread } = (await res.json()) as { unread: number };
    if (prev.current !== null && unread > prev.current) setPop((p) => p + 1);
    prev.current = unread;
    setCount(unread);
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    const now = () => void poll();
    window.addEventListener(NOTIFICATIONS_CHANGED, now);
    return () => {
      clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED, now);
    };
  }, [poll]);

  const load = useCallback(async () => {
    const [res, series] = await Promise.all([
      fetch("/api/bo-get/me/notifications?limit=6").catch(() => null),
      idx.size ? null : listSeries().catch(() => []),
    ]);
    if (series) setIdx(seriesIndex(series));
    setItems(
      res?.ok
        ? ((await res.json()) as { notifications: NotificationDTO[] })
            .notifications
        : [],
    );
  }, [idx.size]);

  useEffect(() => {
    if (!open) return;
    void load();
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !box.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, load]);

  const markAll = async () => {
    await boPost("me/notifications/read", { all: true }).catch(() => null);
    setItems(
      (xs) =>
        xs?.map((x) => ({ ...x, readAt: x.readAt ?? Date.now() / 1000 })) ??
        null,
    );
    prev.current = 0;
    setCount(0);
  };

  const markOne = (n: NotificationDTO) => {
    if (n.readAt) return;
    void boPost("me/notifications/read", { ids: [n.id] }).catch(() => null);
    prev.current = Math.max(0, count - 1);
    setCount((c) => Math.max(0, c - 1));
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={t("bellLabel", { count })}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-btn text-n700 transition-colors hover:bg-n100"
      >
        <Icon name="bell" className="size-5" />
        {count > 0 && (
          <span
            key={pop}
            data-testid="bell-count"
            className={cx(
              "num absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-err-fg px-1 text-[10px] leading-none font-bold text-white ring-2 ring-n0",
              pop > 0 && "animate-qp-pop",
            )}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("title")}
          className="animate-qp-rise fixed inset-x-2 top-16 z-50 overflow-hidden rounded-card border border-n200 bg-n0 shadow-[0_24px_64px_-24px_rgba(18,26,22,.45)] sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-n100 px-4 py-3">
            <span className="font-bold">{t("title")}</span>
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={count === 0}
              className="rounded-sm px-2 py-1 text-xs font-semibold text-g700 hover:bg-g50 disabled:text-n400 disabled:hover:bg-transparent"
            >
              {t("markAll")}
            </button>
          </div>
          {items === null ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-n500">
              {t("empty")}
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-n100 overflow-y-auto">
              {items.map((n) => {
                const v = notice(n, idx);
                return (
                  <li key={n.id}>
                    <Link
                      href={v.href}
                      onClick={() => {
                        markOne(n);
                        setOpen(false);
                      }}
                      className={cx(
                        "flex gap-3 px-4 py-3 transition-colors hover:bg-n50",
                        !n.readAt && "bg-g50/40",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cx(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          n.readAt ? "bg-n200" : TONE_DOT[v.tone],
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-n900">
                          {t(`kinds.${v.kind}.title`, v.values)}
                        </span>
                        <span className="mt-0.5 block text-xs text-n600">
                          {t(`kinds.${v.kind}.body`, v.values)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] whitespace-nowrap text-n500">
                        {ago(n.createdAt, locale)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href="/account/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-n100 px-4 py-2.5 text-center text-sm font-semibold text-g700 hover:bg-g50"
          >
            {t("seeAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
