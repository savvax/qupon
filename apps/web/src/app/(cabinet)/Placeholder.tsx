import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/** Temporary cabinet home until the role's dashboard task lands (302 / 303 / 306). */
export async function Placeholder({
  name,
  legacyHref,
}: {
  name?: string;
  legacyHref: string;
}) {
  const t = await getTranslations("cabinet.placeholder");
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {name ? t("hello", { name }) : t("welcome")}
      </h1>
      <div className="mt-6">
        <EmptyState
          title={t("title")}
          body={t("body")}
          action={
            <Button asChild variant="secondary">
              <Link href={legacyHref}>{t("console")}</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
