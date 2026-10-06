"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";

/** Header "Sign in": hidden on /login itself, where the form is the page. */
export function SignInButton({ label }: { label: string }) {
  if (usePathname() === "/login") return null;
  return (
    <span className="hidden sm:block">
      <Button asChild size="sm" className="h-9">
        <Link href="/login">{label}</Link>
      </Button>
    </span>
  );
}
