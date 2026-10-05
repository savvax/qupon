import type { Metadata } from "next";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Kpi } from "@/components/ui/Kpi";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stepper } from "@/components/ui/Stepper";
import { STATUS_TONE } from "@/lib/ui/badge";
import type { ButtonSize, ButtonVariant } from "@/lib/ui/button";
import { GalleryDemo } from "./demo";

// Dev-only component reference (not linked from any nav); excluded from search engines.
export const metadata: Metadata = {
  title: "Qupon · UI gallery",
  robots: { index: false, follow: false },
};

const VARIANTS: ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "destructive",
  "primaryOnDark",
  "secondaryOnDark",
];

const SIZES: ButtonSize[] = ["sm", "md", "lg"];

/** Amount pairs chosen to stress grouping, 6-decimal USDC and the 18-digit precision case. */
const AMOUNTS: { minor: string; currency: string; locale: "en" | "ru" }[] = [
  { minor: "50000", currency: "tKZT", locale: "en" },
  { minor: "125000", currency: "tKZT", locale: "ru" },
  { minor: "325000", currency: "tKZT", locale: "en" },
  { minor: "1000000", currency: "tKZT", locale: "en" },
  { minor: "105000000000000", currency: "USDC", locale: "ru" },
  { minor: "123456789012345678", currency: "USDC", locale: "en" },
];

const MINT = "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo";
const SIG =
  "4J3pSbG7fNfUX9VZXvCjJFh3Pv2VkD1Ry8StQqPq6bFgWHXn5ydEPAmxCvfX1QqTMdgKkTQEH7kq5FZ5THJ1W8Z";

function Section({
  title,
  children,
  dark = false,
}: {
  title: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section className="mt-10">
      <h2
        className={
          dark
            ? "mb-2 text-xs font-semibold uppercase tracking-wider text-n300"
            : "mb-2 text-xs font-semibold uppercase tracking-wider text-n500"
        }
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function GalleryPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold">UI gallery</h1>
      <p className="mt-1 text-sm text-n600">
        Every design-system component and state on one page. Dev reference for
        the public pages and the cabinet (Plan 2); not linked from any nav.
      </p>

      <Section title="Button · variants × default / disabled / loading">
        <div className="space-y-4">
          {VARIANTS.map((variant) => {
            const onDark =
              variant === "primaryOnDark" || variant === "secondaryOnDark";
            const row = (
              <div
                key={variant}
                className="flex flex-wrap items-center gap-2 rounded-card p-3"
              >
                <span className="w-36 shrink-0 font-mono text-xs text-n500">
                  {variant}
                </span>
                <Button variant={variant}>Continue</Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
                <Button variant={variant} loading>
                  Sending
                </Button>
              </div>
            );
            return onDark ? (
              <div key={variant} className="rounded-card bg-p900 p-1">
                {row}
              </div>
            ) : (
              row
            );
          })}
          <div className="rounded-card bg-p900 p-1">
            <div className="flex flex-wrap items-center gap-2 rounded-card p-3">
              <span className="w-36 shrink-0 font-mono text-xs text-n300">
                hover / active
              </span>
              {VARIANTS.filter(
                (v) => v === "primaryOnDark" || v === "secondaryOnDark",
              ).map((variant) => (
                <Button key={variant} variant={variant}>
                  Point at me
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Button · sizes sm / md / lg + icon slots">
        <div className="flex flex-wrap items-end gap-2">
          {SIZES.map((size) => (
            <Button key={size} size={size}>
              {size}
            </Button>
          ))}
          <Button iconLeft={<span aria-hidden>←</span>}>Back</Button>
          <Button iconRight={<span aria-hidden>→</span>}>Next</Button>
          <Button variant="secondary" block className="max-w-64">
            block
          </Button>
        </div>
      </Section>

      <Section title="Badge · every status in badge.ts (+ unknown fallback)">
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(STATUS_TONE).map((status) => (
            <Badge key={status} status={status} />
          ))}
          <Badge status="SomethingNew" />
          <Badge tone="violet">explicit tone</Badge>
          <Badge dot={false}>no dot</Badge>
        </div>
      </Section>

      <Section title="Amount · EN / RU, 18-digit minor units (scrollable cell)">
        <div className="max-w-full overflow-x-auto rounded-card border border-n200 bg-n0 p-4">
          <ul className="min-w-max space-y-2">
            {AMOUNTS.map((a) => (
              <li key={`${a.minor}-${a.locale}`} className="flex gap-6">
                <span className="w-28 shrink-0 font-mono text-xs text-n500">
                  {a.locale} · {a.currency}
                </span>
                <Amount
                  minor={a.minor}
                  currency={a.currency}
                  locale={a.locale}
                />
              </li>
            ))}
            <li className="flex gap-6">
              <span className="w-28 shrink-0 font-mono text-xs text-n500">
                ru · tKZT
              </span>
              <Amount minor="105000000" currency="tKZT" locale="ru" />
            </li>
          </ul>
        </div>
      </Section>

      <Section title="Address · address and tx (truncates, copies, explores)">
        <Card className="flex max-w-lg flex-col gap-3">
          <Address value={MINT} />
          <Address value={SIG} kind="tx" />
          <div className="w-48 max-w-full truncate text-xs text-n500">
            narrow parent → <Address value={MINT} />
          </div>
        </Card>
      </Section>

      <Section title="Card · padding md / lg">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="font-bold">Card md</h3>
            <p className="mt-1 text-sm text-n600">Default padding.</p>
          </Card>
          <Card padding="lg">
            <h3 className="font-bold">Card lg</h3>
            <p className="mt-1 text-sm text-n600">
              Roomier padding for hero-side panels.
            </p>
          </Card>
        </div>
      </Section>

      <Section title="Kpi · coupon maths (10 / 25 / 65 units, 1 000 ₸ face)">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Face value"
            value={<Amount minor="100000" currency="tKZT" />}
            hint="per unit"
          />
          <Kpi
            label="Coupon · holder A"
            value={<Amount minor="50000" currency="tKZT" />}
            hint="10 units"
          />
          <Kpi
            label="Coupon · holder B"
            value={<Amount minor="125000" currency="tKZT" />}
            hint="25 units"
          />
          <Kpi
            label="Coupon · holder C"
            value={<Amount minor="325000" currency="tKZT" />}
            hint="65 units"
          />
        </div>
      </Section>

      <Section title="Stepper · done / current / todo">
        <div className="space-y-3">
          <Stepper
            steps={[
              { key: "a", label: "Announce", state: "current" },
              { key: "b", label: "Record date", state: "todo" },
              { key: "c", label: "Snapshot", state: "todo" },
              { key: "d", label: "Pay", state: "todo" },
            ]}
          />
          <Stepper
            steps={[
              { key: "a", label: "Announce", state: "done" },
              { key: "b", label: "Record date", state: "done" },
              { key: "c", label: "Snapshot", state: "current" },
              { key: "d", label: "Pay", state: "todo" },
            ]}
          />
          <Stepper
            steps={[
              { key: "a", label: "Announce", state: "done" },
              { key: "b", label: "Record date", state: "done" },
              { key: "c", label: "Snapshot", state: "done" },
              { key: "d", label: "Pay", state: "done" },
            ]}
          />
        </div>
      </Section>

      <Section title="Skeleton · loading a bond page">
        <Card className="max-w-lg space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-4 w-3/4" />
        </Card>
      </Section>

      <Section title="EmptyState · with action">
        <EmptyState
          title="No entitlements yet"
          body="Entitlements appear once the record date is struck and the snapshot completes."
          action={<Button variant="secondary">Refresh</Button>}
        />
      </Section>

      <GalleryDemo />
    </main>
  );
}
