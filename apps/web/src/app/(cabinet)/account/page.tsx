import { StableLabel, StableText } from "@/components/i18n/StableLabel";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PasswordForm, ProfileForm } from "@/components/account/ProfileForms";
import { type LinkedWallet, WalletLink } from "@/components/account/WalletLink";
import { SignOutButton } from "@/components/shell/SignOutButton";
import { Icon } from "@/components/shell/icons";
import { Card } from "@/components/ui/Card";
import { boFetch } from "@/lib/bo";
import { getSession } from "@/lib/session";
import { toLocale } from "@/i18n/locale";

export async function generateMetadata() {
  const t = await getTranslations("account");
  return { title: `${t("title")} · Qupon` };
}

/** The signed-in user's account: profile, password and linked wallets (platform v2 §5.3). */
export default async function AccountPage() {
  const t = await getTranslations("account");
  // The form shows the language the interface is in now (switching it there also updates the profile).
  const uiLocale = toLocale(await getLocale());
  const c = await getTranslations("cabinet");
  const n = await getTranslations("notify");
  const user = await getSession();
  if (!user) return null; // the layout already redirected
  const wallets = user.isDemo
    ? []
    : ((
        await boFetch<{ wallets: LinkedWallet[] }>("/me/wallets").catch(
          () => null,
        )
      )?.wallets ?? []);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">
          <StableText>{t("title")}</StableText>
        </h1>
        <p className="mt-1 text-sm text-n600">
          {user.name} · {user.email} · {c(`roles.${user.role}`)}
        </p>
        <Link
          href="/account/notifications"
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-g700 hover:underline"
        >
          <Icon name="bell" className="size-4" />
          <StableLabel>{n("title")}</StableLabel>
        </Link>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-bold">
          <StableText>{t("profile.title")}</StableText>
        </h2>
        {user.isDemo ? (
          <p className="text-sm text-n600">
            <StableText>{t("profile.demo")}</StableText>
          </p>
        ) : (
          <ProfileForm name={user.name} locale={uiLocale} />
        )}
      </Card>

      {!user.isDemo && (
        <Card>
          <h2 className="mb-4 text-lg font-bold">
            <StableText>{t("password.title")}</StableText>
          </h2>
          <PasswordForm />
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-bold">
          <StableText>{t("wallets.title")}</StableText>
        </h2>
        <p className="mt-1 mb-4 text-sm text-n600">
          <StableText>{t("wallets.lead")}</StableText>
        </p>
        {user.isDemo ? (
          <p className="rounded-card bg-warn-bg p-4 text-sm text-warn-fg">
            {t("wallets.demo")}{" "}
            <Link href="/signup" className="font-semibold underline">
              {t("wallets.signup")}
            </Link>
          </p>
        ) : (
          <WalletLink wallets={wallets} />
        )}
      </Card>
      <div className="sm:hidden">
        <SignOutButton variant="secondary" size="md" />
      </div>
    </div>
  );
}
