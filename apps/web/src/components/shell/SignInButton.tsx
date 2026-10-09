"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";

/** Header "Sign in": a quiet secondary entry (the CTA is the primary one); hidden on /login itself. */
export function SignInButton({ label }: { label: string }) {
  if (usePathname() === "/login") return null;
  return (
    <span className="hidden md:block">
      <Button asChild size="sm" variant="ghost" className="h-9">
        <Link href="/login">{label}</Link>
      </Button>
    </span>
  );
}
