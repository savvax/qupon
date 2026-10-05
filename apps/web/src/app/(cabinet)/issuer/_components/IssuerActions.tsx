"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { boPost } from "@/lib/boClient";
import { parseRateBps } from "@/lib/schedulePreview";
import { cx } from "@/lib/ui/cx";
import { useRunWrite } from "@/lib/useRunWrite";

type Write = { signatures?: string[]; skipped?: boolean };

/** "2026-10-06T10:00" read as Almaty wall-clock time → unix seconds. */
const almatyLocal = (v: string) =>
  Math.floor(Date.parse(`${v}:00+05:00`) / 1000);

function Choice<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  label: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-n800">
        {label}
      </legend>
      <div className="grid gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-btn border p-3 text-sm",
              value === o.value
                ? "border-g600 bg-g50"
                : "border-n200 hover:border-n300",
            )}
          >
            <input
              type="radio"
              className="mt-0.5 accent-g600"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>
              <span className="font-semibold text-n900">{o.label}</span>
              {o.hint && (
                <span className="mt-0.5 block text-xs text-n600">{o.hint}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Timing({
  fast,
  setFast,
  fastHint,
  children,
}: {
  fast: boolean;
  setFast: (v: boolean) => void;
  fastHint: string;
  children: ReactNode;
}) {
  const t = useTranslations("issuer.dialogs");
  return (
    <div className="space-y-3">
      <Choice
        label={t("timing")}
        value={fast ? "fast" : "custom"}
        onChange={(v) => setFast(v === "fast")}
        options={[
          { value: "fast", label: t("fast"), hint: fastHint },
          { value: "custom", label: t("custom"), hint: t("customHint") },
        ]}
      />
      {!fast && <div className="grid gap-3 sm:grid-cols-2">{children}</div>}
    </div>
  );
}

/** Announce a coupon, redemption or early call. Fast timing puts the record date 2 min out so the demo runs end to end. */
export function AnnounceButton({ mint }: { mint: string }) {
  const t = useTranslations("issuer.dialogs");
  const router = useRouter();
  const runWrite = useRunWrite();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"INTR" | "REDM" | "MCAL">("INTR");
  const [fast, setFast] = useState(true);
  const [recordAt, setRecordAt] = useState("");
  const [paymentAt, setPaymentAt] = useState("");
  const [callDate, setCallDate] = useState("");
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (busy) return;
    const now = Math.floor(Date.now() / 1000);
    const rec = fast ? now + 120 : almatyLocal(recordAt);
    const pay = fast ? now + 180 : almatyLocal(paymentAt);
    if (
      !Number.isFinite(rec) ||
      !Number.isFinite(pay) ||
      rec <= now ||
      pay < rec
    )
      return setError(t("errors.dates"));
    if (kind === "MCAL" && !/^\d{4}-\d{2}-\d{2}$/.test(callDate))
      return setError(t("errors.callDate"));
    setError(undefined);
    setBusy(true);
    const res = await runWrite<Write>({
      pending: t("announcing"),
      success: () => t("announced"),
      call: () =>
        boPost(`issuer/series/${mint}/actions`, {
          kind,
          recordAt: rec,
          paymentAt: pay,
          ...(kind === "MCAL" ? { callDate } : {}),
        }),
      txs: (r) => r.signatures ?? [],
      onError: (_, text) => setError(text),
    });
    setBusy(false);
    if (res) {
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("announce")}</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("announceTitle")}
        description={t("announceLead")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {t("cancel")}
            </Button>
            <Button loading={busy} onClick={submit}>
              {t("announceSubmit")}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Choice
            label={t("kind")}
            value={kind}
            onChange={setKind}
            options={[
              {
                value: "INTR",
                label: t("kinds.INTR"),
                hint: t("kindHints.INTR"),
              },
              {
                value: "REDM",
                label: t("kinds.REDM"),
                hint: t("kindHints.REDM"),
              },
              {
                value: "MCAL",
                label: t("kinds.MCAL"),
                hint: t("kindHints.MCAL"),
              },
            ]}
          />
          {kind === "MCAL" && (
            <TextField
              label={t("callDate")}
              type="date"
              value={callDate}
              onChange={(e) => setCallDate(e.target.value)}
            />
          )}
          <Timing fast={fast} setFast={setFast} fastHint={t("fastHint")}>
            <TextField
              label={t("recordAt")}
              type="datetime-local"
              value={recordAt}
              onChange={(e) => setRecordAt(e.target.value)}
            />
            <TextField
              label={t("paymentAt")}
              type="datetime-local"
              value={paymentAt}
              onChange={(e) => setPaymentAt(e.target.value)}
            />
          </Timing>
          {error && (
            <p
              role="alert"
              className="rounded-btn border border-err-bd bg-err-bg px-3 py-2 text-sm text-err-fg"
            >
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}

/** Call a bondholder meeting proposing a new coupon rate. */
export function MeetingButton({
  mint,
  currentRateBps,
}: {
  mint: string;
  currentRateBps: number;
}) {
  const t = useTranslations("issuer.dialogs");
  const router = useRouter();
  const runWrite = useRunWrite();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState(String((currentRateBps + 200) / 100));
  const [fast, setFast] = useState(true);
  const [recordAt, setRecordAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (busy) return;
    const bps = parseRateBps(rate);
    if (bps === undefined) return setError(t("errors.rate"));
    const now = Math.floor(Date.now() / 1000);
    const rec = fast ? now + 120 : almatyLocal(recordAt);
    const ends = fast ? now + 900 : almatyLocal(endsAt);
    if (
      !Number.isFinite(rec) ||
      !Number.isFinite(ends) ||
      rec <= now ||
      ends <= rec
    )
      return setError(t("errors.dates"));
    setError(undefined);
    setBusy(true);
    const res = await runWrite<Write>({
      pending: t("calling"),
      success: () => t("called"),
      call: () =>
        boPost(`issuer/series/${mint}/meetings`, {
          newRateBps: bps,
          recordAt: rec,
          votingEndsAt: ends,
        }),
      txs: (r) => r.signatures ?? [],
      onError: (_, text) => setError(text),
    });
    setBusy(false);
    if (res) {
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("meeting")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("meetingTitle")}
        description={t("meetingLead")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {t("cancel")}
            </Button>
            <Button loading={busy} onClick={submit}>
              {t("meetingSubmit")}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <TextField
            label={t("newRate")}
            hint={t("currentRate", { rate: (currentRateBps / 100).toFixed(2) })}
            inputMode="decimal"
            suffix="%"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <Timing fast={fast} setFast={setFast} fastHint={t("fastMeetingHint")}>
            <TextField
              label={t("recordAt")}
              type="datetime-local"
              value={recordAt}
              onChange={(e) => setRecordAt(e.target.value)}
            />
            <TextField
              label={t("votingEndsAt")}
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </Timing>
          {error && (
            <p
              role="alert"
              className="rounded-btn border border-err-bd bg-err-bg px-3 py-2 text-sm text-err-fg"
            >
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}

/** Fund an action's escrow from the paying agent (the CLI tops up only the shortfall, so repeats are no-ops). */
export function FundButton({
  pda,
  size = "sm",
}: {
  pda: string;
  size?: "sm" | "md";
}) {
  const t = useTranslations("issuer.dialogs");
  const router = useRouter();
  const runWrite = useRunWrite();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size={size}
      loading={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        const res = await runWrite<Write>({
          pending: t("funding"),
          success: (r) => (r.skipped ? t("alreadyFunded") : t("funded")),
          call: () => boPost(`issuer/actions/${pda}/fund`, {}),
          txs: (r) => r.signatures ?? [],
        });
        setBusy(false);
        if (res) router.refresh();
      }}
    >
      {t("fund")}
    </Button>
  );
}
