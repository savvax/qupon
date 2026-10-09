import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CabinetShell } from "@/components/shell/CabinetShell";
import { CabinetNow } from "../CabinetNow";
import { TopbarExtras } from "@/components/shell/TopbarExtras";
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
    s &&
    (s.role === "investor_demo" || s.role === "investor" || s.role === "admin")
      ? s
      : null;
  const t = await getTranslations("cabinet.menu");
  return (
    <CabinetShell
      role={user?.role === "investor" ? "investor" : "investor_demo"}
      user={user}
      topbar={<TopbarExtras />}
      nav={investorNav((k) => t(k))}
      now={<CabinetNow role="investor" />}
    >
      {children}
    </CabinetShell>
  );
}
