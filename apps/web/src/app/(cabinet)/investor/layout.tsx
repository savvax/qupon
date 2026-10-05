import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CabinetShell } from "@/components/shell/CabinetShell";
import { getSession } from "@/lib/session";
import { investorNav } from "../nav";

/** Open to wallet investors without a back-office session; a demo-investor session shows its user and DEMO pill. */
export default async function InvestorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = await getSession();
  const user =
    s && (s.role === "investor_demo" || s.role === "admin") ? s : null;
  const t = await getTranslations("cabinet.menu");
  return (
    <CabinetShell
      role="investor_demo"
      user={user}
      nav={investorNav((k) => t(k))}
    >
      {children}
    </CabinetShell>
  );
}
