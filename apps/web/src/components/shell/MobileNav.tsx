"use client";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Dialog";
import { Icon } from "./icons";

/** Hamburger + drawer with the public links (under 768 px). */
export function MobileNav({
  links,
  menuLabel,
  signInLabel,
  extra,
}: {
  links: { href: string; label: string }[];
  menuLabel: string;
  signInLabel: string;
  /** Rendered under the links (the View-as role switch). */
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={menuLabel}
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-btn text-n700 hover:bg-n100 lg:hidden"
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
        {extra && <div className="mt-4 border-t border-n100 pt-4">{extra}</div>}
        <Button asChild block variant="secondary" className="mt-4">
          <Link href="/login" onClick={() => setOpen(false)}>
            {signInLabel}
          </Link>
        </Button>
      </Drawer>
    </>
  );
}
