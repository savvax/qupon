import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CabinetShell } from "@/components/shell/CabinetShell";
import { TopbarExtras } from "@/components/shell/TopbarExtras";
import { requireRole } from "@/lib/session";
import { adminNav } from "../nav";

/** Platform administration (platform v2 §5.2): admins only. */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireRole("/admin", "admin");
  const t = await getTranslations("cabinet.menu");
  return (
    <CabinetShell
      role="admin"
      user={user}
      nav={adminNav((k) => t(k))}
      topbar={<TopbarExtras />}
    >
      {children}
    </CabinetShell>
  );
}
