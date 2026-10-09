import { getLocale, getTranslations } from "next-intl/server";
import { StableText } from "@/components/i18n/StableLabel";
import { GlossaryTerm, type GlossaryKey } from "@/components/ui/GlossaryTerm";
import { MoneyFlow, type MoneyFlowProps } from "@/components/ui/MoneyFlow";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { getAction, listEntitlements } from "@/lib/api";
import { moneyFlowOf } from "@/lib/moneyFlow";
import type { Live } from "./live";

const TERMS: GlossaryKey[] = ["recordDate", "escrow", "entitlement", "taxVault", "payingAgent", "permissionless"];

/** The brief's coupon when the API has no completed payout: 10 / 25 / 65 bonds → 500 / 1,250 / 3,250 ₸. */
const EXAMPLE: Pick<MoneyFlowProps, "currency" | "escrow" | "recipients"> = {
  currency: "tKZT",
  escrow: { required: "500000", funded: "500000" },
  recipients: [
    { id: "a", kind: "holder", label: "Holder A", sub: "10", amount: "50000", status: "paid" },
    { id: "b", kind: "holder", label: "Holder B", sub: "25", amount: "125000", status: "paid" },
    { id: "c", kind: "holder", label: "Holder C", sub: "65", amount: "325000", status: "paid" },
  ],
};

/** "Follow one coupon": the last completed payout as a money flow, from the chain (or the brief, labelled). */
export async function FlowSection({ live }: { live: Live }) {
  const [t, tk, locale] = await Promise.all([
    getTranslations("landing.flow"),
    getTranslations("kit.money"),
    getLocale(),
  ]);
  const units = (u: string) => tk("holderSub", { units: u });
  const pda = live.last?.actionPda;
  const real = pda
    ? await Promise.all([getAction(pda), listEntitlements(pda)])
        .then(([a, e]) => (e.length ? moneyFlowOf(a, e, live.activity, units) : null))
        .catch(() => null)
    : null;
  const flow = real ?? {
    ...EXAMPLE,
    recipients: EXAMPLE.recipients.map((r) => ({ ...r, sub: units(r.sub ?? "") })),
  };
  return (
    <section id="flow" className="mx-auto w-full max-w-[1200px] scroll-mt-28 px-4 pt-16 sm:px-6 sm:pt-24">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-end">
        <h2 className="qp-reveal max-w-xl text-2xl font-extrabold tracking-tight text-balance sm:text-[2rem] sm:leading-tight">
          <StableText>{t("title")}</StableText>
        </h2>
        <p className="qp-reveal max-w-[62ch] text-n700">
          <StableText>{t("lead")}</StableText>
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-n600">
        <ProvenanceChip kind={real ? "onchain" : "simulated"} />
        <span className="text-n500">{t("terms")}:</span>
        {TERMS.map((k) => (
          <GlossaryTerm key={k} term={k} stable />
        ))}
      </div>
      <MoneyFlow
        className="qp-reveal mt-6"
        currency={flow.currency}
        locale={locale === "ru" ? "ru" : "en"}
        issuer={{
          label: live.last?.ticker ?? "QPNb1",
          address: live.active.find((s) => s.mint === live.last?.mint)?.issuer ?? undefined,
        }}
        escrow={flow.escrow}
        recipients={flow.recipients}
        title={live.last ? `${live.last.ticker} · ${live.last.kind}` : undefined}
        example={!real}
      />
    </section>
  );
}
