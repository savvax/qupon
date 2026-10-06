import type { ReactNode } from "react";

/** Print views (task 902): no cabinet shell — a standalone A4 sheet with its own print styles. */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-n100 py-8 print:bg-white print:py-0">
      {children}
    </div>
  );
}
