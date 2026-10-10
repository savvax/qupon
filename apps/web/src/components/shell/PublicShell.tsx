import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StableLabel } from "@/components/i18n/StableLabel";
import { Button } from "@/components/ui/Button";
import { NetworkChip } from "@/components/ui/NetworkChip";
import { WalletButton } from "@/components/wallet/WalletButton";
import { latestSlot, MOCK_API } from "@/lib/api";
import { getNetwork } from "@/lib/network";
import { cx } from "@/lib/ui/cx";
import { HideOnPath } from "./HideOnPath";
import { LocaleSwitch } from "./LocaleSwitch";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { SignInButton } from "./SignInButton";

const REPO = "https://github.com/savvax/qupon";
const CONTAINER = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";
const ROLES = ["issuer", "registrar", "investor"] as const;

/**
 * "View as: Public · Issuer · Registrar · Investor": each role is a one-click demo session (a plain form post, so it
 * works before hydration); Public is where the visitor already is. Hidden where demo login is off (mainnet).
 */
async function ViewAs({
  demo,
  compact = false,
}: {
  demo: boolean;
  compact?: boolean;
}) {
  const t = await getTranslations("nav");
  const seg =
    "inline-flex h-8 items-center rounded-sm px-2.5 text-xs font-bold whitespace-nowrap transition-colors";
  return (
    <div
      className={cx(
        "flex items-center gap-2",
        compact && "flex-col items-stretch",
      )}
    >
      <span className="text-xs font-semibold text-n600">
        <StableLabel align="start">{t("viewAs")}</StableLabel>
      </span>
      <div
        role="group"
        aria-label={t("viewAs")}
        className={cx(
          "inline-flex gap-0.5 rounded-btn border border-n200 bg-n0 p-0.5",
          compact && "grid grid-cols-2",
        )}
      >
        <Link
          href="/bonds"
          aria-current="page"
          className={cx(seg, "bg-p900 text-white")}
        >
          <StableLabel>{t("view.public")}</StableLabel>
        </Link>
        {demo &&
          ROLES.map((r) => (
            <form
              key={r}
              action="/api/session/demo"
              method="post"
              className="contents"
            >
              <input type="hidden" name="role" value={r} />
              <button
                type="submit"
                className={cx(seg, "text-n700 hover:bg-n50 hover:text-n900")}
              >
                <StableLabel>{t(`view.${r}`)}</StableLabel>
              </button>
            </form>
          ))}
      </div>
    </div>
  );
}

/** Public site frame: sticky top bar (one primary CTA), the View-as / network sub-bar, content, footer. */
export async function PublicShell({ children }: { children: ReactNode }) {
  const [t, c, f, network, slot] = await Promise.all([
    getTranslations("nav"),
    getTranslations("common"),
    getTranslations("footer"),
    getNetwork(),
    latestSlot(),
  ]);
  const links = [
    { href: "/bonds", label: t("bonds") },
    { href: "/learn", label: t("learn") },
    { href: "/#how", label: t("howItWorks") },
    { href: "/sandbox/new", label: t("sandbox") },
  ];
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-n200 bg-n0/95 backdrop-blur">
        <div className={`${CONTAINER} flex h-16 items-center gap-2 sm:gap-3`}>
          {/* The tagline lives in the hero and the link title: in the bar it pushed the RU header past 1200 px. Below
              420 px the wordmark goes too: EN/RU/KZ, the CTA and the menu need the room (no sideways scroll at 390). */}
          <Link
            href="/"
            title={t("tagline")}
            className="mr-1 flex h-10 shrink-0 items-center gap-2.5 rounded-btn"
          >
            <Logo />
            <span className="text-lg font-extrabold tracking-tight text-n900 max-[419px]:sr-only">
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
            <LocaleSwitch />
            <span className="hidden md:contents">
              <WalletButton compact labelAt="2xl" />
            </span>
            <SignInButton label={c("signIn")} />
            {/* the header's one primary action */}
            <Button asChild size="sm" className="h-9">
              {/* the sandbox is devnet-only (the registrar refuses /demo/sandbox on mainnet) */}
              <Link href={network.mainnet ? "/login?choose=1" : "/sandbox/new"}>
                <span className="sm:hidden">
                  <StableLabel>{t("tryShort")}</StableLabel>
                </span>
                <span className="max-sm:hidden">
                  <StableLabel>{t("try")}</StableLabel>
                </span>
              </Link>
            </Button>
            <MobileNav
              links={links}
              menuLabel={t("menu")}
              signInLabel={c("signIn")}
              extra={<ViewAs demo={network.demoLogin} compact />}
            />
          </div>
        </div>
        <div className="hidden border-t border-n100 bg-n50/80 sm:block">
          <div
            className={`${CONTAINER} flex h-12 items-center justify-between gap-4`}
          >
            <HideOnPath path="/login">
              <ViewAs demo={network.demoLogin} />
            </HideOnPath>
            <span aria-hidden className="flex-1" />
            <NetworkChip slot={slot} live={!MOCK_API} />
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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
            <span className="sm:hidden">
              <NetworkChip slot={slot} />
            </span>
            <span>© Qupon</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
