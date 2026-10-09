import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { ButtonVariant } from "@/lib/ui/button";

/** Start a demo session as `role` and land on `next` (a plain form post: works before hydration). */
export function DemoAsButton({
  role,
  next,
  children,
  variant = "primary",
}: {
  role: "issuer" | "registrar" | "investor";
  next: string;
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <form action="/api/session/demo" method="post">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant={variant}>
        {children}
      </Button>
    </form>
  );
}
