import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/shell/PublicShell";
import { Button } from "@/components/ui/Button";

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
        <div className="rounded-card border border-n200 bg-n0 px-6 py-12 text-center">
          <p className="num text-sm font-bold text-g700">404</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-n600">{t("body")}</p>
          <div className="mt-6 flex flex-col justify-center gap-2 min-[480px]:flex-row">
            <Button asChild>
              <Link href="/">{t("home")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/bonds">{t("bonds")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
