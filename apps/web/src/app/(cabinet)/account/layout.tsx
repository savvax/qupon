import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CabinetShell } from "@/components/shell/CabinetShell";
import { TopbarExtras } from "@/components/shell/TopbarExtras";
import { requireRole } from "@/lib/session";
import { navForRole } from "../nav";

/** Shared account area (profile, wallets, notifications) for every signed-in role, framed by its own cabinet nav. */
export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireRole(
    "/account",
    "issuer",
    "registrar",
    "investor_demo",
    "investor",
  );
  const t = await getTranslations("cabinet.menu");
  return (
    <CabinetShell
      role={user.role}
      user={user}
      nav={navForRole(user.role, (k) => t(k))}
      topbar={<TopbarExtras />}
    >
      {children}
    </CabinetShell>
  );
}
