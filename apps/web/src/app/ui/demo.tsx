"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, Drawer } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { TextField } from "@/components/ui/TextField";
import { Tooltip } from "@/components/ui/Tooltip";
import { toast } from "@/components/ui/toastStore";

const SERIES = [
  { value: "kzbond-27", label: "KZ27BOND001 · 10% semi-annual" },
  { value: "kzbond-28", label: "KZ28BOND002 · 9.5% quarterly" },
  { value: "kzbond-29", label: "KZ29BOND003 · 11% annual" },
];

const TX =
  "4J3pSbG7fNfUX9VZXvCjJFh3Pv2VkD1Ry8StQqPq6bFgWHXn5ydEPAmxCvfX1QqTMdgKkTQEH7kq5FZ5THJ1W8Z";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-n500">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Interactive half of the gallery: overlays, inputs and toasts need client state. */
export function GalleryDemo() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [series, setSeries] = useState<string | undefined>();

  return (
    <>
      <Section title="Dialog / Drawer · triggers">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Strike record date?"
          description="The mint pauses immediately and holder balances are snapshotted on-chain."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setDialogOpen(false);
                  toast({
                    kind: "success",
                    title: "Record date struck",
                    tx: TX,
                  });
                }}
              >
                Strike record date
              </Button>
            </>
          }
        >
          <p className="text-sm text-n600">
            Coupon #3 · record date 2027-02-27, payment date 2027-03-05.
          </p>
        </Dialog>
        <Drawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title="Holder entitlements"
          description="Per-holder amounts after withholding (SIMULATED tax vault)."
          footer={
            <Button onClick={() => setDrawerOpen(false)}>Close drawer</Button>
          }
        >
          <ul className="space-y-1 text-sm text-n600">
            <li>Holder A · 10 units · 500,00 ₸</li>
            <li>Holder B · 25 units · 1 250,00 ₸</li>
            <li>Holder C · 65 units · 3 250,00 ₸</li>
          </ul>
        </Drawer>
      </Section>

      <Section title="Select · series picker">
        <Card className="max-w-sm">
          <Select
            label="Bond series"
            options={SERIES}
            value={series}
            onValueChange={setSeries}
            placeholder="Choose a series"
          />
        </Card>
      </Section>

      <Section title="Tabs · bond page sections">
        <Tabs
          items={[
            {
              value: "schedule",
              label: "Schedule",
              content: (
                <p className="text-sm text-n600">
                  Coupons every 182 days, 30E/360 day count.
                </p>
              ),
            },
            {
              value: "actions",
              label: "Corporate actions",
              content: (
                <p className="text-sm text-n600">
                  Announced coupon · record date · escrow funding.
                </p>
              ),
            },
            {
              value: "terms",
              label: "Terms",
              content: <p className="text-sm text-n600">ISIN, face, issuer.</p>,
            },
          ]}
        />
      </Section>

      <Section title="Tooltip · hover or focus the button">
        <Tooltip content="30E/360: 30-day months, 360-day year — the KASE convention.">
          <Button variant="ghost">Why 30E/360?</Button>
        </Tooltip>
      </Section>

      <Section title="TextField · default / error / suffix">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Holder"
            placeholder="DL8G…aJEo"
            hint="Solana pubkey"
          />
          <TextField
            label="Units"
            inputMode="numeric"
            defaultValue="10001"
            error="Units exceed the issued amount (10 000)"
          />
          <TextField
            label="Price"
            inputMode="decimal"
            defaultValue="1 000,00"
            suffix="₸"
          />
        </div>
      </Section>

      <Section title="Toast · every kind + pending → success with tx">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              toast({ kind: "success", title: "Coupon batch paid" })
            }
          >
            success
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                kind: "error",
                title: "Escrow funding failed",
                body: "Insufficient funds for batch 2/3",
              })
            }
          >
            error
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ kind: "info", title: "Snapshot complete" })}
          >
            info
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const id = toast({
                kind: "pending",
                title: "Settling batch 1/3…",
              });
              setTimeout(() => {
                toast.update(id, {
                  kind: "success",
                  title: "Batch 1/3 settled",
                  tx: TX,
                });
              }, 1500);
            }}
          >
            pending → success
          </Button>
        </div>
      </Section>
    </>
  );
}
