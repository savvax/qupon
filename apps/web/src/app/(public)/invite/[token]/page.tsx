import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StableText } from "@/components/i18n/StableLabel";
import { ScopedIntl } from "@/components/i18n/ScopedIntl";
import { ROLE_HOME, getSession } from "@/lib/session";
import { InviteForm } from "./InviteForm";

export async function generateMetadata() {
  const t = await getTranslations("org.invitePage");
  return { title: `${t("title")} · Qupon` };
}

/** One-time team invite link (task 807): creates the account inside the inviting organisation. */
async function InviteTree({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getSession();
  if (user) redirect(ROLE_HOME[user.role]);
  const t = await getTranslations("org.invitePage");
  // The (public) layout already provides PublicShell; wrapping again stacked two site headers.
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-extrabold tracking-tight">
        <StableText>{t("title")}</StableText>
      </h1>
      <p className="mt-1 text-sm text-n600">
        <StableText>{t("lead")}</StableText>
      </p>
      <div className="mt-6">
        <InviteForm token={token} />
      </div>
      <p className="mt-6 text-sm text-n600">
        {t("haveAccount")}{" "}
        <a href="/login" className="font-semibold text-g700 underline">
          {t("signIn")}
        </a>
      </p>
    </div>
  );
}

/** task 91575: ship only this route's client namespaces. */
const SCOPE = ["org.invitePage", "common"] as const;

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <ScopedIntl paths={SCOPE}>
      <InviteTree params={params} />
    </ScopedIntl>
  );
}
