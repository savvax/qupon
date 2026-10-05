import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/shell/PublicShell";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export async function generateMetadata() {
  const t = await getTranslations("errors.notFound");
  return { title: t("title") };
}

/** Global 404: unmatched URLs and notFound() calls land here. */
export default async function NotFound() {
  const t = await getTranslations("errors.notFound");
  return (
    <PublicShell>
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <EmptyState
          title={t("title")}
          body={t("body")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/">{t("home")}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/bonds">{t("bonds")}</Link>
              </Button>
            </div>
          }
        />
      </div>
    </PublicShell>
  );
}
