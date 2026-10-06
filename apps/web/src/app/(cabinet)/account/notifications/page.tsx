import { getTranslations } from "next-intl/server";
import { listSeries } from "@/lib/api";
import { boFetch } from "@/lib/bo";
import type { NotificationDTO } from "@/lib/notifications";
import { NotificationList } from "./NotificationList";

export async function generateMetadata() {
  const t = await getTranslations("notify");
  return { title: `${t("title")} · Qupon` };
}

/** Every notification of the signed-in user (task 805); the bell shows the latest six. */
export default async function NotificationsPage() {
  const t = await getTranslations("notify");
  const [list, series] = await Promise.all([
    boFetch<{ notifications: NotificationDTO[] }>(
      "/me/notifications?limit=100",
    ).catch(() => null),
    listSeries().catch(() => []),
  ]);
  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-n600">{t("lead")}</p>
      </header>
      {list === null ? (
        <p
          role="alert"
          className="rounded-card bg-err-bg p-4 text-sm text-err-fg"
        >
          {t("unavailable")}
        </p>
      ) : (
        <NotificationList initial={list.notifications} series={series} />
      )}
    </div>
  );
}
