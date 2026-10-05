"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/lib/ui/cx";
import { activeHref } from "@/lib/ui/nav";
import { LocaleSwitch } from "./LocaleSwitch";
import { Logo } from "./Logo";

export type CabinetRole = "issuer" | "registrar" | "investor_demo" | "admin";
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
  children,
}: {
  role: CabinetRole;
  nav: CabinetNavItem[];
  user: CabinetUser | null;
  breadcrumb?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("cabinet");
  const c = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const active = activeHref(
    pathname,
    nav.map((n) => n.href),
  );

  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/session/logout", { method: "POST" }).catch(
      () => undefined,
    );
    router.push("/login");
    router.refresh();
  };

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
                "flex h-10 items-center gap-3 rounded-btn px-3 text-sm font-semibold",
                n.href === active
                  ? "bg-g50 text-g700"
                  : "text-n700 hover:bg-n100 hover:text-n900",
              )}
            >
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-n200 bg-n0/95 px-4 backdrop-blur sm:px-8">
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
          <LocaleSwitch />
          {user && (
            <>
              <div className="hidden text-right leading-tight lg:block">
                <div className="text-sm font-semibold text-n900">
                  {user.name}
                </div>
                <div className="text-xs text-n500">
                  {t(`roles.${user.role}`)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={signingOut}
                onClick={signOut}
              >
                {c("signOut")}
              </Button>
            </>
          )}
        </header>
        <main className="p-4 pb-24 sm:p-8 md:pb-8">{children}</main>
      </div>

      <nav
        aria-label={t("nav")}
        className="fixed inset-x-0 bottom-0 z-30 grid h-16 border-t border-n200 bg-n0 md:hidden"
        style={{
          gridTemplateColumns: `repeat(${Math.min(nav.length, 5)}, minmax(0, 1fr))`,
        }}
      >
        {nav.slice(0, 5).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={n.href === active ? "page" : undefined}
            className={cx(
              "flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold",
              n.href === active ? "text-g700" : "text-n600",
            )}
          >
            {n.icon}
            <span className="max-w-full truncate">{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
