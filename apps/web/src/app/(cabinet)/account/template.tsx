import type { ReactNode } from "react";
import { FadeIn } from "@/components/motion/FadeIn";

/** Page transition inside the cabinet shell: client-side navigations fade the new page in; first loads render as is. */
export default function Template({ children }: { children: ReactNode }) {
  return <FadeIn>{children}</FadeIn>;
}
