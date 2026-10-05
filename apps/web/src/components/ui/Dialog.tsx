"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Action row, right-aligned (render `<Button />`s here). */
  footer?: ReactNode;
  children?: ReactNode;
};

const overlay = "fixed inset-0 z-50 bg-n900/40";

const CLOSE =
  "absolute top-4 right-4 rounded-sm px-1 text-n400 hover:bg-n100 hover:text-n700";

function Body({
  title,
  description,
  footer,
  children,
}: Pick<DialogProps, "title" | "description" | "footer" | "children">) {
  return (
    <>
      <DialogPrimitive.Title className="pr-8 text-xl font-bold">
        {title}
      </DialogPrimitive.Title>
      {description && (
        <DialogPrimitive.Description className="mt-1 text-sm text-n600">
          {description}
        </DialogPrimitive.Description>
      )}
      {children && <div className="mt-4">{children}</div>}
      {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      <DialogPrimitive.Close aria-label="Close" className={CLOSE}>
        ✕
      </DialogPrimitive.Close>
    </>
  );
}

/** Centered modal dialog. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-card bg-n0 p-6 shadow-[0_24px_64px_-24px_rgba(18,26,22,.45)]">
          <Body title={title} description={description} footer={footer}>
            {children}
          </Body>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Same API as `<Dialog />`; slides in from the right (≥640 px) / bottom (mobile). */
export function Drawer(props: DialogProps) {
  const { open, onOpenChange } = props;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-card bg-n0 p-6 shadow-[0_24px_64px_-24px_rgba(18,26,22,.45)] sm:inset-x-auto sm:top-0 sm:right-0 sm:h-full sm:max-h-none sm:w-[24rem] sm:rounded-t-none sm:rounded-l-card">
          <Body
            title={props.title}
            description={props.description}
            footer={props.footer}
          >
            {props.children}
          </Body>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
