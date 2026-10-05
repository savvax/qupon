import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CabinetShell } from "@/components/shell/CabinetShell";
import { requireRole } from "@/lib/session";
import { issuerNav } from "../nav";

export default async function IssuerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireRole("/issuer", "issuer");
  const t = await getTranslations("cabinet.menu");
  return (
    <CabinetShell role="issuer" user={user} nav={issuerNav((k) => t(k))}>
      {children}
    </CabinetShell>
  );
}
