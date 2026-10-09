"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Renders nothing on `path` (e.g. the View-as switch on /login, where the role choice is the page itself). */
export function HideOnPath({ path, children }: { path: string; children: ReactNode }) {
  return usePathname() === path ? null : <>{children}</>;
}
