import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CabinetShell } from "@/components/shell/CabinetShell";
import { CabinetNow } from "../CabinetNow";
import { HideOnPath } from "@/components/shell/HideOnPath";
import { TopbarExtras } from "@/components/shell/TopbarExtras";
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
    <CabinetShell
      role="registrar"
      user={user}
      topbar={<TopbarExtras />}
      nav={registrarNav((k) => t(k))}
      now={
        // the action console renders its own NowBar — one NowBar per page (design language §11)
        <HideOnPath prefix="/registrar/actions/">
          <CabinetNow role="registrar" />
        </HideOnPath>
      }
    >
      {children}
    </CabinetShell>
  );
}
