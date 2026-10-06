import { StableText } from "@/components/i18n/StableLabel";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PasswordForm, ProfileForm } from "@/components/account/ProfileForms";
import { type LinkedWallet, WalletLink } from "@/components/account/WalletLink";
import { Card } from "@/components/ui/Card";
import { boFetch } from "@/lib/bo";
import { getSession } from "@/lib/session";

export async function generateMetadata() {
  const t = await getTranslations("account");
  return { title: `${t("title")} · Qupon` };
}

/** The signed-in user's account: profile, password and linked wallets (platform v2 §5.3). */
export default async function AccountPage() {
  const t = await getTranslations("account");
  const c = await getTranslations("cabinet");
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
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">
          <StableText>{t("title")}</StableText>
        </h1>
        <p className="mt-1 text-sm text-n600">
          {user.name} · {user.email} · {c(`roles.${user.role}`)}
        </p>
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
          <ProfileForm
            name={user.name}
            locale={user.locale === "ru" ? "ru" : "en"}
          />
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
    </div>
  );
}
