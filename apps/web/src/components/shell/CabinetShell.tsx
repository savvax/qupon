"use client";
import { SPRING } from "@/lib/motion";
import { m } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { cx } from "@/lib/ui/cx";
import { activeHref } from "@/lib/ui/nav";
import { StableLabel } from "@/components/i18n/StableLabel";
import { Drawer } from "@/components/ui/Dialog";
import { Icon } from "./icons";
import { LocaleSwitch } from "./LocaleSwitch";
import { Logo } from "./Logo";
import { SignOutButton } from "./SignOutButton";

export type CabinetRole =
  "issuer" | "registrar" | "investor_demo" | "investor" | "admin";
export type CabinetNavItem = { href: string; label: string; icon?: ReactNode };
export type CabinetUser = { name: string; role: CabinetRole; isDemo: boolean };

/**
 * Back-office frame: 240 px sidebar (≥768 px) or bottom tab bar (max 5 items), top bar with breadcrumb slot,
 * DEMO pill, language and sign-out. `user` is null for a wallet investor without a back-office session.
 */
export function CabinetShell({
  role,
  nav,
  user,
  breadcrumb,
  topbar,
  children,
}: {
  role: CabinetRole;
  nav: CabinetNavItem[];
  user: CabinetUser | null;
  breadcrumb?: ReactNode;
  /** Server-rendered top-bar items (network badge, notification bell): <TopbarExtras />. */
  topbar?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("cabinet");
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = activeHref(
    pathname,
    nav.map((n) => n.href),
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-n200 bg-n0 md:flex">
        <Link href="/" className="flex h-16 items-center gap-2.5 px-5">
          <Logo />
          <span className="text-lg font-extrabold tracking-tight">Qupon</span>
        </Link>
        <div className="px-5 pb-2 text-xs font-bold tracking-wider text-n500 uppercase">
          {t(`roles.${role}`)}
        </div>
        <nav aria-label={t("nav")} className="flex flex-col gap-0.5 px-3">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={n.href === active ? "page" : undefined}
              className={cx(
                "relative flex h-10 items-center gap-3 rounded-btn px-3 text-sm font-semibold transition-colors",
                n.href === active
                  ? "text-g700"
                  : "text-n700 hover:bg-n100 hover:text-n900",
              )}
            >
              {/* The active highlight glides to the selected item (motion layoutId, spring). */}
              {n.href === active && (
                <m.span
                  layoutId="cabinet-nav-active"
                  transition={SPRING}
                  className="absolute inset-0 rounded-btn bg-g50"
                />
              )}
              <span className="relative flex items-center gap-3">
                {n.icon}
                {n.label}
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 sm:gap-3 border-b border-n200 bg-n0/95 px-4 backdrop-blur sm:px-8">
          <Link href="/" aria-label="Qupon" className="md:hidden">
            <Logo />
          </Link>
          <div className="min-w-0 flex-1 truncate text-sm text-n600">
            {breadcrumb}
          </div>
          {user?.isDemo && (
            <span className="rounded-full bg-warn-bg px-2.5 py-1 text-xs font-bold tracking-wide text-warn-fg">
              {t("demo")}
            </span>
          )}
          {topbar}
          <LocaleSwitch />
          {user && (
            <>
              <Link
                href="/account"
                className="hidden rounded-lg px-2 py-1 text-right leading-tight transition hover:bg-n50 lg:block"
              >
                <div className="text-sm font-semibold text-n900">
                  {user.name}
                </div>
                <div className="text-xs text-n500">
                  <StableLabel align="end">
                    {t(`roles.${user.role}`)}
                  </StableLabel>
                </div>
              </Link>
              {/* Below lg the name block is hidden: an account button keeps /account one tap away. */}
              <Link
                href="/account"
                aria-label={t("account")}
                className="grid size-9 shrink-0 place-items-center rounded-btn text-n700 transition-colors hover:bg-n100 lg:hidden"
              >
                <Icon name="user" className="size-5" />
              </Link>
              <span className="hidden sm:contents">
                <SignOutButton />
              </span>
            </>
          )}
        </header>
        <main className="overflow-x-clip p-4 pb-24 sm:p-8 md:pb-8">
          {children}
        </main>
      </div>

      {/* Phones: up to five tabs; with more sections the fifth is "More", a sheet with the rest (spec §5.8). */}
      <nav
        aria-label={t("nav")}
        className="fixed inset-x-0 bottom-0 z-30 grid h-16 border-t border-n200 bg-n0/95 backdrop-blur md:hidden"
        style={{
          gridTemplateColumns: `repeat(${Math.min(nav.length, 5)}, minmax(0, 1fr))`,
        }}
      >
        {(nav.length > 5 ? nav.slice(0, 4) : nav).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={n.href === active ? "page" : undefined}
            className={cx(
              "flex flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] leading-tight font-semibold transition-colors",
              n.href === active ? "text-g700" : "text-n600",
            )}
          >
            {n.icon}
            <span className="line-clamp-2 max-w-full">{n.label}</span>
          </Link>
        ))}
        {nav.length > 5 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            className={cx(
              "flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight font-semibold",
              nav.slice(4).some((n) => n.href === active)
                ? "text-g700"
                : "text-n600",
            )}
          >
            <Icon name="menu" />
            <span>{t("more")}</span>
          </button>
        )}
      </nav>
      {nav.length > 5 && (
        <Drawer open={moreOpen} onOpenChange={setMoreOpen} title={t("more")}>
          <ul className="grid gap-1">
            {nav.slice(4).map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={n.href === active ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-3 rounded-btn px-3 py-3 text-base font-semibold transition-colors",
                    n.href === active
                      ? "bg-g50 text-g700"
                      : "text-n800 hover:bg-n50",
                  )}
                >
                  {n.icon}
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </Drawer>
      )}
    </div>
  );
}
