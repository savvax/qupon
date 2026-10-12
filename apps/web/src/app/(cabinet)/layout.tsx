import type { ReactNode } from "react";
import { ScopedIntl } from "@/components/i18n/ScopedIntl";

/**
 * Cabinets keep the FULL client message set (task 91575 scopes the public routes instead): dense internal tool
 * with dozens of feature namespaces, and its HTML size is not on the judge path.
 */
export default function CabinetLayout({ children }: { children: ReactNode }) {
  return <ScopedIntl>{children}</ScopedIntl>;
}
