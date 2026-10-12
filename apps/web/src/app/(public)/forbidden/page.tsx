import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/shell/SignOutButton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScopedIntl } from "@/components/i18n/ScopedIntl";
import { ROLE_HOME, type Role } from "@/lib/session";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("forbidden") };
}

async function ForbiddenTree({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const t = await getTranslations("forbidden");
  const role = (await searchParams).role as Role | undefined;
  const home = role && role in ROLE_HOME ? ROLE_HOME[role] : undefined;
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <EmptyState
        title={t("title")}
        body={t("body")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {home && (
              <Button asChild>
                <Link href={home}>{t("home")}</Link>
              </Button>
            )}
            <SignOutButton variant="secondary" size="md" />
          </div>
        }
      />
    </div>
  );
}

/** task 91575: ship only this route's client namespaces. */
const SCOPE = ["forbidden", "common"] as const;

export default function Forbidden({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  return (
    <ScopedIntl paths={SCOPE}>
      <ForbiddenTree searchParams={searchParams} />
    </ScopedIntl>
  );
}
