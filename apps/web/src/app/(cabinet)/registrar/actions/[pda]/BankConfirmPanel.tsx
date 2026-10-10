"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { postConfirmBank, type BankPendingPayout } from "@/lib/api";
import { type BoError } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";
import { cx } from "@/lib/ui/cx";
import { type Locale } from "@/i18n/locale";

type ConfirmResult = { ok: boolean; signature?: string; explorerUrl?: string };

/**
 * Bank confirmations (plan 15 D6): every entitlement the pay step routed to the paying agent, one row per holder.
 * The agent confirms each with the bank transfer reference — the bank transfer itself is SIMULATED; only the
 * sha256 of the reference goes on-chain (the console sends the reference, the program hashes it).
 */
export function BankConfirmPanel({
  pda,
  items,
  locale,
}: {
  pda: string;
  items: BankPendingPayout[];
  locale: Locale;
}) {
  const t = useTranslations("action.bank");
  if (items.length === 0) return null;
  return (
    <section
      id="bank"
      className="rounded-card border border-bank-bd bg-bank-bg/40 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{t("title")}</h3>
        <Badge tone="bank">{t("count", { count: items.length })}</Badge>
      </div>
      <p className="mt-1 max-w-prose text-sm text-n600">{t("lead")}</p>
      <div className="mt-3 space-y-2">
        {items.map((row) => (
          <ConfirmRow key={row.owner} pda={pda} row={row} locale={locale} />
        ))}
      </div>
      <p className="mt-3 text-xs text-n500">{t("note")}</p>
    </section>
  );
}

function ConfirmRow({
  pda,
  row,
  locale,
}: {
  pda: string;
  row: BankPendingPayout;
  locale: Locale;
}) {
  const t = useTranslations("action.bank");
  const router = useRouter();
  const runWrite = useRunWrite();
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const confirm = async () => {
    if (busy || !reference.trim()) return;
    setBusy(true);
    setError(undefined);
    const res = await runWrite<ConfirmResult>({
      pending: t("sending"),
      success: () => t("confirmed"),
      call: () =>
        postConfirmBank(pda, { owner: row.owner, reference: reference.trim() }),
      // confirm_bank is an on-chain write: its signature must be linked (AGENTS.md)
      txs: (r) => [r.signature ?? ""].filter(Boolean),
      onError: (_e: BoError, text: string) => setError(text),
    });
    if (!res) {
      setBusy(false);
      return;
    }
    // the entitlement flips to Paid and bank_pending drops: refresh until the row disappears
    setTimeout(() => router.refresh(), 1500);
  };

  return (
    <div
      className={cx(
        "rounded-btn border border-bank-bd bg-n0 px-3 py-2.5",
        "grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Address value={row.owner} />
          {row.amount && (
            <span className="text-sm font-semibold">
              <Amount
                minor={row.amount.minor}
                currency={row.amount.currency}
                locale={locale}
              />
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-n500">
          {t("routeHash", { hash: row.routeBankRefHash || "—" })}
        </div>
        {error && (
          <p role="alert" className="mt-1 text-xs text-err-fg">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={t("reference")}
          aria-label={t("reference")}
          className="h-9 w-44 rounded-btn border border-n200 bg-n0 px-2.5 text-sm placeholder:text-n400"
        />
        <Button
          size="sm"
          loading={busy}
          disabled={!reference.trim()}
          onClick={confirm}
        >
          {t("confirm")}
        </Button>
      </div>
    </div>
  );
}
