import { getTranslations } from "next-intl/server";
import { metaTitle } from "@/lib/meta";
import { ResetForm } from "./ResetForm";
import { ScopedIntl } from "@/components/i18n/ScopedIntl";

export async function generateMetadata() {
  return { title: await metaTitle("resetPassword") };
}

/**
 * Public password-reset page (platform v2 §5.3): the admin issues a one-time
 * 24 h link; the user sets a new password here. The token is consumed on use
 * (POST /auth/reset via /api/session/reset) and the user's sessions die.
 */
async function ResetTree({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("admin.reset");
  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:py-14">
      <div className="rounded-hero border border-n200 bg-n0 p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-n600">{t("lead")}</p>
        <ResetForm token={token} />
      </div>
    </div>
  );
}

/** task 91575: ship only this route's client namespaces. */
const SCOPE = ["admin.reset", "common"] as const;

export default function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <ScopedIntl paths={SCOPE}>
      <ResetTree params={params} />
    </ScopedIntl>
  );
}
