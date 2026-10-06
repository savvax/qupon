import type { ReactNode } from "react";
import { FadeIn } from "@/components/motion/FadeIn";

/** Page transition on the public site, like the cabinets: client-side navigations fade in; first loads render as is. */
export default function Template({ children }: { children: ReactNode }) {
  return <FadeIn>{children}</FadeIn>;
}
