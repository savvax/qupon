"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/lib/ui/cx";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "match"; hash: string; anchored: string }
  | { kind: "mismatch"; hash: string; anchored: string }
  | { kind: "notAnchored"; hash: string }
  | { kind: "error"; message: string };

/** sha256 hex of the bytes — WebCrypto, entirely in the browser. */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Disclosure hash check (plan 15 D9): fetch the seev.031 the registrar serves, hash it in the browser and
 * compare with the sha256 anchored on the action (`disclosure:attach` ran right after announce). ✓ means the
 * official notice on-chain is exactly the bytes served here; ✗ means they diverged. The fetch goes through
 * the same-origin session proxy (/api/bo-get) so no CORS is involved.
 */
export function DisclosureHashPanel({
  pda,
  anchored,
}: {
  pda: string;
  /** hex sha256 anchored on the action (ActionDTO.disclosureHash); null = never anchored */
  anchored?: string | null;
}) {
  const t = useTranslations("action.disclosureHash");
  const [state, setState] = useState<State>({ kind: "idle" });

  const verify = async () => {
    if (state.kind === "checking") return;
    setState({ kind: "checking" });
    try {
      // same-origin session proxy: the bytes are public, the browser just must be able to read them
      const res = await fetch(`/api/bo-get/actions/${pda}/iso/seev031.xml`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const hash = await sha256Hex(await res.arrayBuffer());
      if (!anchored) setState({ kind: "notAnchored", hash });
      else if (hash === anchored.toLowerCase())
        setState({ kind: "match", hash, anchored });
      else setState({ kind: "mismatch", hash, anchored });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <section className="rounded-card border border-n200 bg-n0 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{t("title")}</h3>
        <Button variant="secondary" size="sm" onClick={verify} loading={state.kind === "checking"}>
          {state.kind === "idle" ? t("verify") : t("again")}
        </Button>
      </div>
      <p className="mt-1 max-w-prose text-sm text-n600">{t("lead")}</p>
      <div className="mt-3 text-sm">
        {state.kind === "idle" && <p className="text-n500">{t("idle")}</p>}
        {state.kind === "match" && (
          <p className="font-semibold text-g700">✓ {t("match")}</p>
        )}
        {(state.kind === "mismatch" || state.kind === "notAnchored") && (
          <p className="font-semibold text-err-fg">
            ✗ {state.kind === "mismatch" ? t("mismatch") : t("notAnchored")}
          </p>
        )}
        {state.kind === "error" && (
          <p className="text-err-fg">
            {t("error")}: {state.message}
          </p>
        )}
        {(state.kind === "match" ||
          state.kind === "mismatch" ||
          state.kind === "notAnchored") && (
          <dl className="mt-2 space-y-1 text-xs">
            <HashRow label={t("servedHash")} value={state.hash} />
            {anchored && <HashRow label={t("onchainHash")} value={anchored} />}
          </dl>
        )}
      </div>
    </section>
  );
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 font-semibold text-n500">{label}</dt>
      <dd className={cx("num break-all", value ? "text-n700" : "text-n400")}>
        {value || "—"}
      </dd>
    </div>
  );
}
