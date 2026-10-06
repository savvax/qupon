import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SignInButton } from "./SignInButton";
import { LocaleSwitch } from "./LocaleSwitch";
import { StableLabel } from "@/components/i18n/StableLabel";
import { WalletButton } from "@/components/wallet/WalletButton";
import { NetworkBadge } from "./NetworkBadge";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";

const REPO = "https://github.com/savvax/qupon";
const CONTAINER = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";

/** Public site frame: sticky top bar, content, footer. */
export function PublicShell({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const c = useTranslations("common");
  const f = useTranslations("footer");
  const links = [
    { href: "/bonds", label: t("bonds") },
    { href: "/#how", label: t("howItWorks") },
    { href: "/#issuers", label: t("forIssuers") },
    { href: "/#investors", label: t("forInvestors") },
  ];
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-n200 bg-n0/95 backdrop-blur">
        <div className={`${CONTAINER} flex h-16 items-center gap-4`}>
          {/* The tagline lives in the hero and the link title: in the bar it pushed the RU header past 1200 px. */}
          <Link
            href="/"
            title={t("tagline")}
            className="flex h-10 shrink-0 items-center gap-2.5 rounded-btn"
          >
            <Logo />
            <span className="text-lg font-extrabold tracking-tight text-n900">
              Qupon
            </span>
          </Link>
          <nav
            aria-label={t("main")}
            className="hidden items-center gap-1 lg:flex"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-btn px-3 py-2 text-sm font-semibold whitespace-nowrap text-n700 transition-colors hover:bg-n100 hover:text-n900"
              >
                <StableLabel>{l.label}</StableLabel>
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:contents">
              <NetworkBadge />
            </span>
            <LocaleSwitch />
            <WalletButton compact labelAt="xl" />
            <SignInButton label={c("signIn")} />
            <MobileNav
              links={links}
              menuLabel={t("menu")}
              signInLabel={c("signIn")}
            />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-n200 bg-n0">
        <div
          className={`${CONTAINER} flex flex-col gap-4 py-8 text-sm text-n600 md:flex-row md:items-center md:justify-between`}
        >
          <div className="flex items-center gap-2.5">
            <Logo size={20} />
            <span>{f("devnet")}</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a className="hover:text-n900" href={REPO}>
              {f("source")}
            </a>
            <a
              className="hover:text-n900"
              href={`${REPO}/blob/main/docs/TECHNICAL_OVERVIEW.md`}
            >
              {f("overview")}
            </a>
            <span>{f("built")}</span>
            <span>© Qupon</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
