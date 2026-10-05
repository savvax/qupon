import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CabinetShell } from "@/components/shell/CabinetShell";
import { requireRole } from "@/lib/session";
import { registrarNav } from "../nav";

export default async function RegistrarLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireRole("/registrar", "registrar");
  const t = await getTranslations("cabinet.menu");
  return (
    <CabinetShell role="registrar" user={user} nav={registrarNav((k) => t(k))}>
      {children}
    </CabinetShell>
  );
}
