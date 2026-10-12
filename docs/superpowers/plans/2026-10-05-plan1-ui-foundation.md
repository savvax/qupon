# Plan 1 — UI foundation (design system, i18n, shells, public pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "KASE, but better" design system in code, EN/RU i18n, the public/cabinet shells and the new public pages (`/`, `/bonds`, `/bonds/[mint]`, `/login` UI), without breaking the legacy console pages.

**Architecture:** Tailwind v4 `@theme` tokens + Manrope (next/font) + a small in-repo component library (Radix primitives only for dialog/select/tabs/tooltip). The App Router is split into route groups: `(public)` new design, `(legacy)` keeps today's dark console pages working until Plan 3 replaces them. i18n with `next-intl` in "no i18n routing" mode (locale from a cookie, default `en`).

**Tech Stack:** Next.js 15 (app router), React 19, Tailwind v4, next-intl 4, @radix-ui/react-{dialog,select,tabs,tooltip,slot}, Vitest (node env, pure helpers), Playwright (visual + smoke).

**Spec:** `docs/superpowers/specs/2026-10-05-qupon-product-design.md` (sections 3, 5, 6, 7).

## Global Constraints

- Colors, spacing, radii, type and button sizes exactly as spec §5 (green 600 = #028a29; petrol; neutrals; 4 px grid; radii 8/10/16/24; Manrope; buttons 32/40/48).
- Amounts: tabular figures, space thousands separator, currency after the amount (`5 000,00 ₸` in RU, `5,000.00 ₸` in EN).
- Every user-visible string goes through `next-intl` (`en.json` and `ru.json` have identical key sets).
- No new dependency beyond: next-intl, @radix-ui/react-dialog, @radix-ui/react-select, @radix-ui/react-tabs, @radix-ui/react-tooltip, @radix-ui/react-slot.
- `pnpm -C apps/web typecheck lint test` and `make verify` green after every task; Next build must succeed (`pnpm -C apps/web build`).
- Legacy pages (`/series/[mint]`, `/actions/[pda]`, `/portal`) keep working and keep their URLs until Plan 3.
- English in code and docs; RU only in `messages/ru.json`.
- Works at 390 px width without horizontal scroll.

## Review Focus

1. Long numbers (e.g. `105 000 000,000000 USDC`) and long addresses in narrow cells must not overflow at 390 px → `Amount` stays on one line inside a scrollable cell, `Address` truncates → overflow assertion on `/ui` at 390 px (Task 8).
2. A RU visitor switching language mid-page must keep the page and see every label translated; a missing RU key must fail CI, not render the raw key → key-parity test (Task 4).
3. The API being unreachable must not crash public pages; `/bonds` shows an error state with retry, not a Next error page → Task 7 test.
4. Keyboard users: every Button/Select/Dialog reachable and visibly focused (focus ring token) → Task 2/3 checks in the kitchen sink (Task 8 Playwright).
5. Unknown statuses from the API (new enum values) must render a neutral badge, never throw → Task 2 test.

---

## File Structure

```
apps/web/
  src/app/layout.tsx                      # root: <html>, font, NextIntlClientProvider, Providers (no shell)
  src/app/globals.css                     # tokens (@theme), base styles
  src/app/(public)/layout.tsx             # PublicShell
  src/app/(public)/page.tsx               # landing  (replaces old series list at "/")
  src/app/(public)/bonds/page.tsx         # bond board
  src/app/(public)/bonds/[mint]/page.tsx  # public bond page
  src/app/(public)/login/page.tsx         # sign-in UI (wired to auth in Plan 3)
  src/app/(legacy)/layout.tsx             # old dark Header + wrapper
  src/app/(legacy)/series/[mint]/…, actions/[pda]/…, portal/…, kitchen-sink/…   # moved, unchanged
  src/app/ui/page.tsx                     # component gallery (new kitchen sink, new design)
  src/components/ui/{Button,Badge,Card,Kpi,Amount,Address,Stepper,Skeleton,EmptyState,Dialog,Select,Tabs,Tooltip,TextField,Toaster}.tsx
  src/components/shell/{PublicShell,CabinetShell,LocaleSwitch,Logo}.tsx
  src/lib/ui/{cx,button,badge,amount}.ts  # pure helpers (unit-tested)
  src/i18n/request.ts                     # next-intl config (cookie locale)
  messages/en.json, messages/ru.json
```

---

### Task 1: Tokens, font, route groups

**Files:**
- Modify: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/(legacy)/layout.tsx`, `apps/web/src/app/(public)/layout.tsx` (temporary minimal), `apps/web/src/lib/ui/cx.ts`, `apps/web/src/lib/ui/cx.test.ts`
- Move (git mv, no content change): `src/app/series`, `src/app/actions`, `src/app/portal`, `src/app/kitchen-sink` → `src/app/(legacy)/…`; `src/app/page.tsx` → `src/app/(legacy)/console/page.tsx` (old series list stays reachable at `/console`)

**Interfaces:**
- Produces: CSS tokens `--color-g50…g900, --color-p50…p900, --color-n0…n900, --color-warn-*, --color-err-*, --radius-btn, --radius-card, --radius-hero`; Tailwind utilities `bg-g600`, `text-n500`, `rounded-card`, …; `cx(...classes: (string|false|null|undefined)[]): string`; font CSS var `--font-manrope`.

- [ ] **Step 1: failing test for `cx`**

```ts
// apps/web/src/lib/ui/cx.test.ts
import { describe, expect, it } from "vitest";
import { cx } from "./cx";

describe("cx", () => {
  it("joins truthy class names with single spaces", () => {
    expect(cx("a", false, null, undefined, "b", "", "c")).toBe("a b c");
  });
});
```

- [ ] **Step 2: run** `pnpm -C apps/web vitest run src/lib/ui/cx.test.ts` → FAIL (module not found)

- [ ] **Step 3: implement**

```ts
// apps/web/src/lib/ui/cx.ts
/** Join class names, dropping falsy values (no dependency on clsx). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

- [ ] **Step 4: tokens** — replace `apps/web/src/app/globals.css` with:

```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-manrope), system-ui, sans-serif;
  --color-g50:#eef9f1; --color-g100:#d6f0de; --color-g200:#ade0bd; --color-g300:#7cca96; --color-g400:#45ae6a;
  --color-g500:#179647; --color-g600:#028a29; --color-g700:#02701f; --color-g800:#035a1c; --color-g900:#04431a;
  --color-accent-dark:#2ec05f;
  --color-p50:#eef6f7; --color-p100:#d4e8eb; --color-p300:#7fb0b8; --color-p500:#1f6f7a; --color-p700:#0f4552;
  --color-p800:#0b2f3a; --color-p900:#071d25;
  --color-n0:#ffffff; --color-n50:#f6f8f7; --color-n100:#eef2f0; --color-n200:#e2e8e5; --color-n300:#cbd4cf;
  --color-n400:#9aa7a0; --color-n500:#6b7972; --color-n600:#4c5953; --color-n700:#34403a; --color-n900:#121a16;
  --color-warn-bg:#fff6e5; --color-warn-fg:#8a5300; --color-warn-bd:#f5d9a1;
  --color-err-bg:#fdeeee; --color-err-fg:#b4171d; --color-err-bd:#f3c2c3;
  --radius-sm:8px; --radius-btn:10px; --radius-card:16px; --radius-hero:24px;
}

@layer base {
  html { color-scheme: light; }
  body { @apply bg-n50 text-n900 antialiased; font-feature-settings: "cv11"; }
  .num { font-variant-numeric: tabular-nums; }
  :focus-visible { outline: none; box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--color-g400); border-radius: var(--radius-btn); }
}
```

- [ ] **Step 5: root layout** — `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Qupon — corporate actions for tokenized bonds",
  description: "Record date, entitlements, escrowed settlement and ISO 20022 for tokenized bonds on Solana (devnet).",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: legacy group** — `git mv` the four legacy route folders and the old `page.tsx` (to `(legacy)/console/page.tsx`), then create `apps/web/src/app/(legacy)/layout.tsx` with the old dark wrapper:

```tsx
import { Header } from "@/components/Header";
import { MOCK_ENABLED } from "@/lib/api";

export default function LegacyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200" style={{ colorScheme: "dark" }}>
      <Header />
      {MOCK_ENABLED && (
        <div className="bg-amber-500 px-4 py-1 text-center text-xs font-bold tracking-wide text-black">
          MOCK DATA — set API_MOCKING=disabled to use the registrar API
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 pb-16">{children}</main>
    </div>
  );
}
```

Update the "all series" back link in `(legacy)/series/[mint]/page.tsx` from `/` to `/console`. Create a temporary `(public)/layout.tsx` returning `<>{children}</>` and a temporary `(public)/page.tsx` that renders `<main className="p-8"><h1 className="text-2xl font-bold text-g600">Qupon</h1></main>` (replaced in Task 6).

- [ ] **Step 7: verify** `pnpm -C apps/web vitest run && pnpm -C apps/web typecheck && pnpm -C apps/web build` → PASS; open `/series/<any mint>` and `/actions/<pda>` locally — legacy look unchanged.

- [ ] **Step 8: commit** `git add -A apps/web && git commit -m "feat(web): design tokens, Manrope, route groups (legacy pages kept)"`

---

### Task 2: Core components (no Radix)

**Files:**
- Create: `src/lib/ui/button.ts`, `src/lib/ui/badge.ts`, `src/lib/ui/amount.ts` (+ `.test.ts` each), `src/components/ui/{Button,Badge,Card,Kpi,Amount,Address,Stepper,Skeleton,EmptyState}.tsx`

**Interfaces:**
- Consumes: `cx` (Task 1), tokens.
- Produces:
  - `buttonClasses(opts: { variant?: "primary"|"secondary"|"ghost"|"destructive"|"primaryOnDark"|"secondaryOnDark"; size?: "sm"|"md"|"lg"; block?: boolean }): string`
  - `<Button variant size loading iconLeft iconRight asChild …buttonProps>` (loading → spinner + `aria-busy`, disabled)
  - `badgeTone(status: string): { bg: string; fg: string }`; `<Badge status="Paid" />` or `<Badge tone="warn">text</Badge>`; label via `prettifyStatus(status)`
  - `formatAmount(minor: string|bigint, decimals: number, locale: "en"|"ru"): string` and `<Amount value={{minor,currency}} decimals? locale? size? />`
  - `<Address value kind="address"|"tx" />` (short form, copy button, explorer link `https://explorer.solana.com/{kind}/{value}?cluster=devnet`)
  - `<Card padding="md"|"lg">`, `<Kpi label value hint? />`, `<Stepper steps={[{key,label,state:"done"|"current"|"todo",href?}]} />`, `<Skeleton className />`, `<EmptyState title body action? />`

- [ ] **Step 1: failing tests**

```ts
// src/lib/ui/button.test.ts
import { describe, expect, it } from "vitest";
import { buttonClasses } from "./button";
describe("buttonClasses", () => {
  it("primary md by default", () => {
    const c = buttonClasses({});
    expect(c).toContain("bg-g600");
    expect(c).toContain("h-10");
  });
  it("sizes map to 32/40/48 px", () => {
    expect(buttonClasses({ size: "sm" })).toContain("h-8");
    expect(buttonClasses({ size: "lg" })).toContain("h-12");
  });
  it("destructive uses the error palette", () => {
    expect(buttonClasses({ variant: "destructive" })).toContain("text-err-fg");
  });
});
```

```ts
// src/lib/ui/badge.test.ts
import { describe, expect, it } from "vitest";
import { badgeTone, prettifyStatus } from "./badge";
describe("badge", () => {
  it("maps known statuses to tones", () => {
    expect(badgeTone("Paid").fg).toBe("text-g700");
    expect(badgeTone("Suspended").fg).toBe("text-err-fg");
    expect(badgeTone("Funded").fg).toBe("text-warn-fg");
  });
  it("unknown statuses are neutral, never throw", () => {
    expect(badgeTone("SomethingNew").fg).toBe("text-n600");
  });
  it("prettifies camel case", () => {
    expect(prettifyStatus("RecordStruck")).toBe("Record struck");
  });
});
```

```ts
// src/lib/ui/amount.test.ts
import { describe, expect, it } from "vitest";
import { formatAmount } from "./amount";
describe("formatAmount", () => {
  it("EN: comma thousands, dot decimals", () => {
    expect(formatAmount("500000", 2, "en")).toBe("5,000.00");
  });
  it("RU: narrow-space thousands, comma decimals", () => {
    expect(formatAmount("10500000", 2, "ru")).toBe("105 000,00");
  });
  it("6-decimal USDC and zero decimals", () => {
    expect(formatAmount("319000", 6, "en")).toBe("0.319000");
    expect(formatAmount(65n, 0, "ru")).toBe("65");
  });
  it("very large values do not lose precision", () => {
    expect(formatAmount("123456789012345678", 2, "en")).toBe("1,234,567,890,123,456.78");
  });
});
```

- [ ] **Step 2: run** `pnpm -C apps/web vitest run src/lib/ui` → FAIL (modules missing)

- [ ] **Step 3: implement helpers**

```ts
// src/lib/ui/button.ts
import { cx } from "./cx";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "primaryOnDark" | "secondaryOnDark";
export type ButtonSize = "sm" | "md" | "lg";
const BASE = "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold border transition-[background,border-color,box-shadow,transform] duration-100 active:translate-y-px disabled:cursor-not-allowed disabled:bg-n100 disabled:text-n400 disabled:border-n200 disabled:shadow-none";
const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] rounded-sm gap-1.5 [&_svg]:size-3.5",
  md: "h-10 px-4 text-sm rounded-btn [&_svg]:size-4",
  lg: "h-12 px-5 text-[15px] rounded-[12px] [&_svg]:size-4",
};
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-g600 text-white border-g700 shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_2px_rgba(4,67,26,.24)] hover:bg-g700 hover:border-g800 active:bg-g800",
  secondary: "bg-n0 text-n900 border-n300 shadow-[0_1px_2px_rgba(18,26,22,.05)] hover:bg-n50 hover:border-n400 active:bg-n100",
  ghost: "bg-transparent text-g700 border-transparent hover:bg-g50 active:bg-g100",
  destructive: "bg-n0 text-err-fg border-err-bd hover:bg-err-bg",
  primaryOnDark: "bg-accent-dark text-[#04210f] border-[#22a64f] shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_6px_16px_-6px_rgba(46,192,95,.55)] hover:brightness-105",
  secondaryOnDark: "bg-white/8 text-[#eaf6f1] border-white/20 hover:bg-white/12",
};
export function buttonClasses({ variant = "primary", size = "md", block = false }: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }): string {
  return cx(BASE, SIZE[size], VARIANT[variant], block && "w-full");
}
```

```ts
// src/lib/ui/badge.ts
export type Tone = "success" | "warn" | "danger" | "info" | "neutral" | "violet";
const TONES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: "bg-g50", fg: "text-g700" },
  warn: { bg: "bg-warn-bg", fg: "text-warn-fg" },
  danger: { bg: "bg-err-bg", fg: "text-err-fg" },
  info: { bg: "bg-p50", fg: "text-p700" },
  neutral: { bg: "bg-n100", fg: "text-n600" },
  violet: { bg: "bg-[#f3efff]", fg: "text-[#5b3cc4]" },
};
const STATUS: Record<string, Tone> = {
  Active: "success", Paid: "success", Completed: "success", Finalized: "success", Retired: "success", For: "success", Approved: "success",
  Announced: "info", RecordStruck: "info", SnapshotComplete: "info", Snapshotted: "info", Projected: "neutral",
  Funded: "warn", Settling: "warn", InProgress: "warn", Matured: "warn",
  Suspended: "danger", Against: "danger", Rejected: "danger",
  VotingOpen: "violet", Retiring: "violet",
  Closed: "neutral", Cancelled: "neutral", Abstain: "neutral", Draft: "neutral",
};
export function badgeTone(statusOrTone: string): { bg: string; fg: string } {
  const t = (statusOrTone in TONES ? statusOrTone : STATUS[statusOrTone]) as Tone | undefined;
  return TONES[t ?? "neutral"];
}
export function prettifyStatus(status: string): string {
  const s = status.replace(/([a-z])([A-Z])/g, "$1 $2");
  return s.charAt(0) + s.slice(1).toLowerCase();
}
```

```ts
// src/lib/ui/amount.ts
/** Exact decimal formatting from integer minor units (no float), grouped per locale. */
export function formatAmount(minor: string | bigint, decimals: number, locale: "en" | "ru"): string {
  const n = BigInt(minor);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const base = 10n ** BigInt(decimals);
  const sep = locale === "ru" ? " " : ",";
  const dot = locale === "ru" ? "," : ".";
  const whole = (abs / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const frac = decimals > 0 ? dot + (abs % base).toString().padStart(decimals, "0") : "";
  return `${neg ? "-" : ""}${whole}${frac}`;
}
export const CURRENCY_SIGN: Record<string, string> = { tKZT: "₸", KZT: "₸", USDC: "USDC" };
```

- [ ] **Step 4: run** `pnpm -C apps/web vitest run src/lib/ui` → PASS

- [ ] **Step 5: components** (presentational, server-safe except Address/Button which are client):

```tsx
// src/components/ui/Button.tsx
"use client";
import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/lib/ui/button";
import { cx } from "@/lib/ui/cx";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: ButtonSize; block?: boolean; loading?: boolean;
  iconLeft?: ReactNode; iconRight?: ReactNode; asChild?: boolean;
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, loading = false, iconLeft, iconRight, asChild, className, children, disabled, ...rest }, ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp ref={ref} className={cx(buttonClasses({ variant, size, block }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : iconLeft}
      {children}
      {!loading && iconRight}
    </Comp>
  );
});
```

```tsx
// src/components/ui/Badge.tsx
import type { ReactNode } from "react";
import { badgeTone, prettifyStatus } from "@/lib/ui/badge";
import { cx } from "@/lib/ui/cx";
export function Badge({ status, tone, children, dot = true }: { status?: string; tone?: string; children?: ReactNode; dot?: boolean }) {
  const t = badgeTone(tone ?? status ?? "neutral");
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold", t.bg, t.fg)}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children ?? (status ? prettifyStatus(status) : null)}
    </span>
  );
}
```

```tsx
// src/components/ui/Amount.tsx
import { CURRENCY_SIGN, formatAmount } from "@/lib/ui/amount";
import { cx } from "@/lib/ui/cx";
const DECIMALS: Record<string, number> = { tKZT: 2, KZT: 2, USDC: 6 };
export function Amount({ minor, currency, decimals, locale = "en", className }: { minor: string | bigint; currency: string; decimals?: number; locale?: "en" | "ru"; className?: string }) {
  const d = decimals ?? DECIMALS[currency] ?? 2;
  return (
    <span className={cx("num whitespace-nowrap", className)} title={`${minor} minor units`}>
      {formatAmount(minor, d, locale)}<span className="ml-1 text-[0.85em] text-n500">{CURRENCY_SIGN[currency] ?? currency}</span>
    </span>
  );
}
```

```tsx
// src/components/ui/Address.tsx
"use client";
import { useState } from "react";
export function Address({ value, kind = "address", label }: { value: string; kind?: "address" | "tx"; label?: string }) {
  const [copied, setCopied] = useState(false);
  const short = value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <a href={`https://explorer.solana.com/${kind}/${value}?cluster=devnet`} target="_blank" rel="noreferrer" className="num truncate font-semibold text-g700 underline decoration-g300 underline-offset-2 hover:decoration-g600">{label ?? short}</a>
      <button type="button" aria-label="Copy" onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }} className="rounded-sm px-1 text-xs text-n500 hover:bg-n100">
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}
```

```tsx
// src/components/ui/Card.tsx, Kpi.tsx, Stepper.tsx, Skeleton.tsx, EmptyState.tsx
import type { ReactNode } from "react";
import { cx } from "@/lib/ui/cx";
export function Card({ children, padding = "md", className }: { children: ReactNode; padding?: "md" | "lg"; className?: string }) {
  return <section className={cx("rounded-card border border-n200 bg-n0", padding === "md" ? "p-4 sm:p-6" : "p-6 sm:p-8", className)}>{children}</section>;
}
export function Kpi({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-card border border-n200 bg-n0 px-5 py-4">
      <div className="text-xs font-semibold text-n500">{label}</div>
      <div className="num mt-1 text-xl font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-n500">{hint}</div>}
    </div>
  );
}
export type Step = { key: string; label: ReactNode; state: "done" | "current" | "todo" };
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-3 rounded-card border border-n200 bg-n0 px-4 py-3 sm:flex-nowrap sm:px-6">
      {steps.map((s, i) => (
        <li key={s.key} className={cx("flex items-center gap-2 text-[13px] font-semibold", s.state === "todo" && "text-n500")}>
          <span className={cx("grid size-6 place-items-center rounded-full text-xs font-bold",
            s.state === "done" && "bg-g600 text-white", s.state === "current" && "bg-n0 text-g700 ring-2 ring-inset ring-g600", s.state === "todo" && "bg-n100 text-n500")}>
            {s.state === "done" ? "✓" : i + 1}
          </span>
          {s.label}
          {i < steps.length - 1 && <span aria-hidden className={cx("ml-1 hidden h-0.5 w-8 rounded sm:block lg:w-14", s.state === "done" ? "bg-g300" : "bg-n200")} />}
        </li>
      ))}
    </ol>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-sm bg-n100", className)} />;
}
export function EmptyState({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-n300 bg-n0 px-6 py-10 text-center">
      <div className="text-base font-bold">{title}</div>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-n600">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
```

(Put each export in its own file named after it; `Step` type lives in `Stepper.tsx`.)

- [ ] **Step 6: verify** `pnpm -C apps/web typecheck lint test` → PASS

- [ ] **Step 7: commit** `git commit -am "feat(web): core UI components (button, badge, amount, address, card, kpi, stepper, skeleton, empty state)"` (add new files first)

---

### Task 3: Radix-based components

**Files:**
- Create: `src/components/ui/{Dialog,Select,Tabs,Tooltip,TextField,Toaster}.tsx`
- Modify: `apps/web/package.json` (deps), `src/components/Providers.tsx` (mount `<Toaster />`)

**Interfaces:**
- Produces:
  - `<Dialog open onOpenChange title description footer>{children}</Dialog>`; `<Drawer …>` = same API, slides from right (≥640 px) / bottom (mobile)
  - `<Select label value onValueChange options={[{value,label}]} placeholder error? />`
  - `<Tabs items={[{value,label,content}]} defaultValue />`
  - `<Tooltip content>{trigger}</Tooltip>`
  - `<TextField label hint error type inputMode suffix …inputProps />` (also used for dates via `type="date"` and amounts with `suffix="₸"`)
  - `toast({ kind: "success"|"error"|"info"|"pending", title, body?, tx?: string, id?: string })` → returns id; `toast.update(id, …)`; `<Toaster />` renders bottom-right stack, tx shown with `<Address kind="tx">`

- [ ] **Step 1:** `pnpm -C apps/web add @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-slot`
- [ ] **Step 2: failing test for the toast store** (pure part):

```ts
// src/components/ui/toastStore.test.ts
import { describe, expect, it } from "vitest";
import { createToastStore } from "./toastStore";
describe("toast store", () => {
  it("adds, updates and dismisses toasts", () => {
    const s = createToastStore();
    const id = s.push({ kind: "pending", title: "Sending" });
    s.update(id, { kind: "success", title: "Paid", tx: "abc" });
    expect(s.list()).toEqual([{ id, kind: "success", title: "Paid", tx: "abc" }]);
    s.dismiss(id);
    expect(s.list()).toEqual([]);
  });
});
```

- [ ] **Step 3: run** `pnpm -C apps/web vitest run src/components/ui/toastStore.test.ts` → FAIL; widen vitest `include` to `["src/**/*.test.ts"]` (already covers `components/`).
- [ ] **Step 4: implement** `toastStore.ts` (array + listeners, `useSyncExternalStore`-compatible `subscribe`/`list`), `Toaster.tsx` (client, renders list, auto-dismiss success/info after 6 s, pending/error stay), and the Radix wrappers styled with tokens: overlay `bg-n900/40`, content `rounded-card bg-n0 p-6 shadow-[0_24px_64px_-24px_rgba(18,26,22,.45)]`, title 20/700, footer right-aligned buttons with `gap-2`; Select trigger = `h-10 rounded-btn border border-n300 px-3`, content `rounded-card border border-n200 bg-n0 p-1 shadow-lg`, item `rounded-sm px-3 py-2 data-[highlighted]:bg-g50`; Tabs list `inline-flex rounded-btn bg-n100 p-1`, trigger `h-8 rounded-sm px-3 data-[state=active]:bg-n0 data-[state=active]:shadow-sm`; TextField label 13/600 `text-n700`, input `h-10 rounded-btn border border-n300 px-3 focus:border-g600`, error text 12 `text-err-fg` with `aria-invalid`/`aria-describedby`.
- [ ] **Step 5: run** tests + `typecheck lint` → PASS
- [ ] **Step 6: commit** `feat(web): dialog, select, tabs, tooltip, text field, toaster`

---

### Task 4: i18n (EN/RU) scaffold

**Files:**
- Create: `apps/web/src/i18n/request.ts`, `apps/web/messages/en.json`, `apps/web/messages/ru.json`, `apps/web/src/components/shell/LocaleSwitch.tsx`, `apps/web/src/app/api/locale/route.ts`, `apps/web/src/i18n/messages.test.ts`
- Modify: `apps/web/next.config.ts` (wrap with `createNextIntlPlugin("./src/i18n/request.ts")`), `apps/web/src/app/layout.tsx` (`NextIntlClientProvider`, `lang={locale}`), `apps/web/package.json` (`next-intl`)

**Interfaces:**
- Produces: `getLocale()`/`useLocale()` returning `"en"|"ru"`; namespaces `common`, `nav`, `landing`, `bonds`, `bond`, `login`, `status`; `POST /api/locale {locale}` sets cookie `NEXT_LOCALE` (1 year, SameSite=Lax) and `router.refresh()` in `<LocaleSwitch />`.

- [ ] **Step 1: failing key-parity test**

```ts
// src/i18n/messages.test.ts
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
const keys = (o: Record<string, unknown>, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
describe("messages", () => {
  it("EN and RU have identical keys", () => {
    expect(keys(ru).sort()).toEqual(keys(en).sort());
  });
  it("no empty strings", () => {
    for (const [name, m] of [["en", en], ["ru", ru]] as const)
      for (const k of keys(m)) expect(k.split(".").reduce((o: any, x) => o[x], m), `${name}:${k}`).not.toBe("");
  });
});
```

- [ ] **Step 2:** run → FAIL (files missing)
- [ ] **Step 3: implement**

```ts
// src/i18n/request.ts
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export default getRequestConfig(async () => {
  const c = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale: Locale = c === "ru" ? "ru" : "en";
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
```

```ts
// src/app/api/locale/route.ts
import { NextResponse } from "next/server";
export async function POST(req: Request) {
  const { locale } = (await req.json().catch(() => ({}))) as { locale?: string };
  if (locale !== "en" && locale !== "ru") return NextResponse.json({ error: "locale must be en or ru" }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
```

`messages/en.json` and `ru.json`: start with namespaces `common` (signIn, signOut, devnet, loading, retry, viewOnExplorer, copy), `nav` (bonds, howItWorks, forIssuers, forInvestors), `status` (one key per status in `badge.ts` STATUS map), `landing`, `bonds`, `bond`, `login` — keys filled as Tasks 6–7 add text; RU translations real (not English copies).

`LocaleSwitch`: segmented control `EN | RU` (Tabs-like, 32 px), POSTs `/api/locale` then `router.refresh()`.

- [ ] **Step 4:** run tests, `typecheck`, `build` → PASS
- [ ] **Step 5: commit** `feat(web): EN/RU i18n with cookie locale and key-parity test`

---

### Task 5: Shells

**Files:**
- Create: `src/components/shell/{Logo,PublicShell,CabinetShell}.tsx`
- Modify: `src/app/(public)/layout.tsx` (use PublicShell)

**Interfaces:**
- Consumes: Button, LocaleSwitch, tokens, `useTranslations("nav")`.
- Produces:
  - `<Logo size?: 20|26 />` — green rounded square with the "coupon notch" (pure CSS/SVG, no KASE assets).
  - `<PublicShell>{children}</PublicShell>` — sticky white top bar (Logo · Qupon · tagline on ≥1024 px; nav: Bonds `/bonds`, How it works `/#how`, For issuers `/#issuers`, For investors `/#investors`; LocaleSwitch; Button "Sign in" → `/login`), mobile: hamburger opening a Drawer with the same links; footer (devnet note, GitHub, technical overview, © Qupon).
  - `<CabinetShell role nav={[{href,label,icon}]} user={{name, role, isDemo}} onSignOut>{children}</CabinetShell>` — 240 px white sidebar (Logo, role caption, nav with active item `bg-g50 text-g700`), topbar (breadcrumb slot, LocaleSwitch, user menu with "Sign out", amber "DEMO" pill if `isDemo`); under 768 px the sidebar becomes a bottom tab bar (max 5 items) and the topbar stays.

- [ ] **Step 1:** implement the three components exactly per the interface (layout constants: container `mx-auto max-w-[1200px] px-4 sm:px-6`, top bar height 64, sidebar width 240, content padding `p-4 sm:p-8`).
- [ ] **Step 2:** add `apps/web/e2e/shell.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
test("public shell renders and switches language", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /bonds|облигации/i }).first()).toBeVisible();
  await page.getByRole("button", { name: "RU" }).click();
  await expect(page.getByRole("link", { name: /Облигации/ }).first()).toBeVisible();
});
test("no horizontal scroll at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 3:** `pnpm -C apps/web build && pnpm -C apps/web e2e e2e/shell.spec.ts` (Playwright `webServer` uses `pnpm start`; set `API_MOCKING=enabled` if the API is not running) → PASS
- [ ] **Step 4: commit** `feat(web): public and cabinet shells`

---

### Task 6: Landing page `/`

**Files:**
- Modify: `src/app/(public)/page.tsx`
- Create: `src/app/(public)/_landing/{Hero,HowItWorks,Scenarios,Audiences,ImplementedVsSimulated,LiveStats}.tsx`
- Modify: `messages/{en,ru}.json` (`landing.*`)

**Interfaces:**
- Consumes: `listSeries()`, `listActivity(200)` from `@/lib/api` (server components), Card, Kpi, Badge, Amount, Button.
- Produces: sections with ids `how`, `issuers`, `investors`, `simulated` (linked from the top nav).

Content (EN; RU translated in messages):
- Hero (petrol radial gradient, radius 24, faint 28 px grid): badge "Live on Solana devnet"; H1 "Every coupon, redemption and bondholder vote — executed on-chain"; lead "Record date, per-holder entitlements, escrowed settlement and ISO 20022 for tokenized bonds, under Kazakhstan market rules."; buttons `primaryOnDark lg` "Open the demo" → `/login`, `secondaryOnDark lg` "Technical overview" → GitHub `docs/TECHNICAL_OVERVIEW.md`; right card "Last corporate action" fed by the newest `ActionCompleted` in activity (series ticker, amount, holders, 6-step bar), fallback to static brief numbers if the API is down.
- Ticker strip: active series as chips (`ticker · coupon% · next date`) + "71 on-chain transactions" from activity count.
- How it works (`#how`): 5 numbered cards: Register (KYC on SAS) → Record date (mint paused, snapshot) → Entitlements (30E/360, half-up per holder) → Escrow & payout (batches, tax vault) → Report (ISO 20022, KASE notice).
- Scenarios: Coupon (500 / 1 250 / 3 250), Redemption (principal + final coupon, burn), Bondholder meeting (10% → 12%), Early redemption (MCAL 47 days).
- Audiences (`#issuers`, `#investors`): two cards with 3 bullets and a CTA each.
- Implemented vs simulated (`#simulated`): table from README (same wording).

- [ ] **Step 1:** implement sections (server components; `LiveStats` wrapped in try/catch → static fallback).
- [ ] **Step 2:** Playwright `e2e/landing.spec.ts`: page has h1, the `#how` section has 5 steps, RU switch shows "Каждый купон", no console errors.
- [ ] **Step 3:** build + e2e → PASS; screenshot at 1440 and 390 px saved to `reports/ui/landing-*.png`.
- [ ] **Step 4: commit** `feat(web): landing page`

---

### Task 7: `/bonds` and `/bonds/[mint]`

**Files:**
- Create: `src/app/(public)/bonds/page.tsx`, `src/app/(public)/bonds/[mint]/page.tsx`, `src/app/(public)/bonds/error.tsx`, `src/components/ui/DataTable.tsx` (replace legacy one in the new design; keep the old file for legacy pages as `LegacyDataTable` if imported)
- Modify: messages (`bonds.*`, `bond.*`)

**Interfaces:**
- Consumes: `listSeries()`, `getSeries(mint)`, `getSchedule(mint)`, `listActions(mint)` from `@/lib/api` (add the last three if missing, typed from `api-schema.d.ts`).
- Produces: `<DataTable columns={[{key, header, align?, render(row), hideBelow?: "sm"|"md"}]} rows rowKey empty? />` — table ≥ 640 px, stacked cards below.

- [ ] **Step 1: failing test** for the DataTable column-visibility helper:

```ts
// src/lib/ui/table.test.ts
import { describe, expect, it } from "vitest";
import { visibleColumns } from "./table";
describe("visibleColumns", () => {
  it("drops columns hidden below the breakpoint", () => {
    const cols = [{ key: "a" }, { key: "b", hideBelow: "md" as const }];
    expect(visibleColumns(cols, "sm").map((c) => c.key)).toEqual(["a"]);
    expect(visibleColumns(cols, "lg").map((c) => c.key)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2:** implement the helper, then `DataTable` (`<table>` with `hidden sm:table` + a `sm:hidden` stacked-card list using the same `columns`):

```ts
// src/lib/ui/table.ts
export type Bp = "sm" | "md" | "lg";
const ORDER: Record<Bp, number> = { sm: 0, md: 1, lg: 2 };
/** Columns visible at breakpoint `bp`: a column with `hideBelow: "md"` is hidden at "sm" and shown from "md" up. */
export function visibleColumns<T extends { hideBelow?: Bp }>(cols: T[], bp: Bp): T[] {
  return cols.filter((c) => !c.hideBelow || ORDER[bp] >= ORDER[c.hideBelow]);
}
```

- [ ] **Step 3:** `/bonds`: H1 "Bonds", lead, filters (Tabs: Active · All), DataTable (Ticker+ISIN, Face, Coupon, Frequency, Next coupon, Status), closed series in "All" only; row links to `/bonds/[mint]`. `error.tsx`: EmptyState "Registrar API unavailable" + Retry (`router.refresh()`).
- [ ] **Step 4:** `/bonds/[mint]`: header (ticker, ISIN, Badge status, Address mint), Kpis (Face, Coupon, Next coupon, Units issued), Tabs: Schedule (table) · Corporate actions (table with Badge + explorer links; registrar-only actions not shown) · Terms (definition list).
- [ ] **Step 5:** e2e `e2e/bonds.spec.ts`: list shows ≥1 row (against deployed API: `API_URL=https://api.185-216-25-91.sslip.io`), clicking opens the bond page with three tabs; with `API_URL=http://127.0.0.1:9` the page shows the unavailable state (no Next error overlay).
- [ ] **Step 6: commit** `feat(web): public bond board and bond page`

---

### Task 8: Component gallery `/ui` + visual check

**Files:**
- Create: `src/app/ui/page.tsx` (not linked from nav; `robots: noindex`), `apps/web/e2e/gallery.spec.ts`

- [ ] **Step 1:** gallery renders every component and state: Button matrix (6 variants × default/hover-class/disabled/loading, sizes), Badge for every status in `badge.ts`, Amount EN/RU samples incl. `123456789012345678` minor, Address, Card, Kpi, Stepper (3 states), Skeleton, EmptyState, Dialog/Drawer triggers, Select, Tabs, Tooltip, TextField (default/error/suffix), toast buttons.
- [ ] **Step 2:** `gallery.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
test("gallery: no console errors, visible focus, no overflow at 390 px", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/ui");
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow);
  expect(ring).toContain("69, 174, 106");
  await page.screenshot({ path: "../../reports/ui/gallery-1440.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "../../reports/ui/gallery-390.png", fullPage: true });
  expect(errors).toEqual([]);
});
```
- [ ] **Step 3:** run `make verify` → green; commit `feat(web): component gallery and visual checks`.

---

## Self-review

- Spec coverage: §5 tokens/components → Tasks 1–3, 8; i18n → Task 4; §3 public pages → Tasks 5–7; `/login` UI is in Plan 3 (needs auth); §6 toasts/errors → Task 3 (toast) + Task 7 (error state); §7 tests → per task + Playwright.
- No placeholders; Task 7 Step 2 states the exact hide rule via the test.
- Names consistent: `buttonClasses`, `badgeTone`, `prettifyStatus`, `formatAmount`, `cx`, `visibleColumns`, `toast`, `createToastStore` used identically across tasks.
