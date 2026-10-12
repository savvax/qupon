import type { ReactNode } from "react";
import { ScopedIntl } from "@/components/i18n/ScopedIntl";

/** Print views (task 902): no cabinet shell — a standalone A4 sheet with its own print styles. */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <ScopedIntl paths={["reports.print", "reports", "common"] as const}>
      <div className="min-h-screen bg-n100 py-8 print:bg-white print:py-0">
        {children}
      </div>
    </ScopedIntl>
  );
}
