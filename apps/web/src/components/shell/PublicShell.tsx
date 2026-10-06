import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { LocaleSwitch } from "./LocaleSwitch";
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
          <Link href="/" className="flex items-center gap-2.5 rounded-btn">
            <Logo />
            <span className="text-lg font-extrabold tracking-tight text-n900">
              Qupon
            </span>
            <span className="hidden border-l border-n200 pl-2.5 text-sm whitespace-nowrap text-n500 xl:inline">
              {t("tagline")}
            </span>
          </Link>
          <nav
            aria-label={t("main")}
            className="ml-2 hidden items-center gap-1 lg:flex"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-btn px-3 py-2 text-sm font-semibold whitespace-nowrap text-n700 transition-colors hover:bg-n100 hover:text-n900"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <NetworkBadge className="hidden md:inline-flex" />
            <LocaleSwitch />
            <span className="hidden sm:block">
              <Button asChild size="sm">
                <Link href="/login">{c("signIn")}</Link>
              </Button>
            </span>
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
