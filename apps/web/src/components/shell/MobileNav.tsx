"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Dialog";
import { Icon } from "./icons";

/** Hamburger + drawer with the public links (under 768 px). */
export function MobileNav({
  links,
  menuLabel,
  signInLabel,
}: {
  links: { href: string; label: string }[];
  menuLabel: string;
  signInLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={menuLabel}
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-btn text-n700 hover:bg-n100 md:hidden"
      >
        <Icon name="menu" />
      </button>
      <Drawer open={open} onOpenChange={setOpen} title={menuLabel}>
        <nav className="flex flex-col gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-btn px-3 py-3 text-base font-semibold text-n800 hover:bg-n100"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Button asChild block className="mt-4">
          <Link href="/login" onClick={() => setOpen(false)}>
            {signInLabel}
          </Link>
        </Button>
      </Drawer>
    </>
  );
}
