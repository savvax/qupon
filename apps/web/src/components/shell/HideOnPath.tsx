"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Renders nothing on `path` (exact, e.g. the View-as switch on /login) or under `prefix` (e.g. the
 * shell Now bar on /registrar/actions/&lt;pda&gt;, where the console renders its own — one per page).
 */
export function HideOnPath({
  path,
  prefix,
  children,
}: {
  path?: string;
  prefix?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if ((path && pathname === path) || (prefix && pathname.startsWith(prefix)))
    return null;
  return <>{children}</>;
}
