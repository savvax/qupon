import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ActionFlow } from "@/components/ui/ActionFlow";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { LifecycleRail, type RailNode } from "@/components/ui/LifecycleRail";
import { MoneyFlow } from "@/components/ui/MoneyFlow";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { toLocale } from "@/i18n/locale";
import { GLOSSARY } from "@/lib/glossary";
import { metaTitle } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await metaTitle("learn") };
}

const PER = { minor: "5000", currency: "tKZT" }; // 50.00 ₸ per 1,000 ₸ bond, the brief's coupon

// Signatures of the plan-15 devnet run (reports/demo-plan15.md, 2026-10-09): each card below links its real
// transaction — the hook record date, the permissionless crank, default + cure, the bank route, the anchored
// notice, the DvP trade with its accrued split.
const TX = {
  announce:
    "2PNnG21fMcneUN95ZtRhT9gqhDisS4vEMcruUAETFDFYEgoithVQuZyFvLUfATM8tME4oc9qdFoJXEJtfmWBx5AS",
  snapshot:
    "5PKcFSJjmkVbDCiYAS7x2aNUvcqtuyVTyEencPssGbwV5hfdZ5Fw77p2bN4mmGf4w3JjNX4q8GKKfKZY48sZwZW8",
  finalize:
    "2cnBqgTiduZsBF3XxCVzbSGCjHhCqSJwGNpmPkerMJhoMGiQsnjiZW4Jf2sWQUaCbKxB8fWrznpXCsvqMeWNL9hn",
  complete:
    "441QHVFtkugQ35XBwETmWPo1RXvfTurDFxJ6knWx64HJFTMu4H1iVJaAq8CGhBSRvFYHFHsGqeUa5gvrwX39SSsG",
  declare:
    "2BvYuaWjSbNxVv3Lb618fTsxeWcNeM8DxZT8Kde33bdXJDLLUhxRs8uWMMAuExaVnf4ERePP75bp2fRGjfgFiBGF",
  fund: "4oWHQsu2wgzoeTtz9h9Updp4qRFujcQbthTszxcag982qGvQtjUdEvTJrc2QgEgKc8ZogRsCspae4J2XbfQrGypu",
  pay: "4cza6XhK3KZLmxtccCYr3YTCTefjmE7uA5SpCfCPbgGxHB58DCNNjSK9q5qwAy4XbLLLDCo8uW1qabVqnqYYdvhE",
  confirmBank:
    "ByrjD8fKtiFdZijuETYpaXL4Zy4JHPmZXs8rxQ8rsuHbrwEwVPtLbpUoDtH8M9xpmZTDFTEaym5oMuiTa2tpVCj",
  disclose:
    "3dsJLizw1ufUAVjDZmtuKoigzyyfcM1smBKojW6MmvGYZcnZW4zLF2RPVa6JQL7TpYuTSWLM8PHtSTAjhWnu3aLg",
  trade:
    "5inUUPFvRRdDQW9YDur9q544kbKL38MrhRC3a1r49xCwsL4NQFKvJnWtiZAAJxccKmnSUYCJt4TJgLsDRzCDZ7BA",
} as const;
const explorer = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/**
 * "How a bond lives on Qupon" (task 1531): a plain-language walkthrough of one coupon (the life on a LifecycleRail,
 * six steps of prose, where the money goes), the plan-15 mechanics (task 91537: hook record date, permissionless
 * crank, default & cure, bank route, anchored notice, accrued interest — each with a real devnet transaction) and
 * then the whole glossary (`#glossary`, linked from the help menu). The brief's numbers throughout; en/ru/kk from
 * the `learn` and `kit.glossary` messages.
 */
export default async function LearnPage() {
  const [t, tg, locale] = await Promise.all([
    getTranslations("learn"),
    getTranslations("kit.glossary"),
    getLocale(),
  ]);
  const loc = toLocale(locale);

  // An illustrative two-year bond: coupon 1 paid, coupon 2 in progress, the last one paid with the principal.
  const rail: RailNode[] = [
    {
      id: "issue",
      kind: "issue",
      title: t("hero.issue"),
      date: "2025-11-01T00:00:00+05:00",
      status: "done",
      statusLabel: t("hero.issued"),
      txCount: 3,
    },
    {
      id: "c1",
      kind: "coupon",
      title: t("hero.coupon", { n: 1 }),
      date: "2026-05-01T00:00:00+05:00",
      status: "done",
      amount: PER,
      txCount: 7,
    },
    {
      id: "c2",
      kind: "coupon",
      title: t("hero.coupon", { n: 2 }),
      date: "2026-11-01T00:00:00+05:00",
      status: "live",
      amount: PER,
    },
    {
      id: "c3",
      kind: "coupon",
      title: t("hero.coupon", { n: 3 }),
      date: "2027-05-01T00:00:00+05:00",
      status: "upcoming",
      amount: PER,
    },
    {
      id: "mat",
      kind: "maturity",
      title: t("hero.maturity"),
      date: "2027-11-01T00:00:00+05:00",
      status: "upcoming",
      amount: { minor: "105000", currency: "tKZT" },
    },
  ];

  const steps = (["s1", "s2", "s3", "s4", "s5", "s6"] as const).map((k) => ({
    k,
    title: t(`steps.${k}.title`),
    body: t(`steps.${k}.body`),
  }));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-title font-extrabold tracking-tight text-balance">
          {t("meta.title")}
        </h1>
        <p className="mt-3 text-base text-n700 sm:text-lg">
          {t("hero.lead1")}{" "}
          <GlossaryTerm term="recordDate">
            {t("hero.termRecordDate")}
          </GlossaryTerm>
          {t("hero.lead2")}
        </p>
      </header>

      <div className="mt-8">
        <LifecycleRail locale={loc} title={t("hero.railTitle")} nodes={rail} />
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-bold">{t("steps.title")}</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {steps.map((s) => (
            <li key={s.k} className="rounded-card border border-n200 bg-n0 p-5">
              <h3 className="font-bold text-n900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-n700">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <MoneyFlow
          currency="tKZT"
          locale={loc}
          issuer={{ label: "QPNb1" }}
          escrow={{ required: "500000", funded: "500000" }}
          recipients={[
            {
              id: "a",
              kind: "holder",
              label: t("money.holder", { name: "A" }),
              sub: t("money.holderSub", { units: "10" }),
              amount: "50000",
              status: "paid",
            },
            {
              id: "b",
              kind: "holder",
              label: t("money.holder", { name: "B" }),
              sub: t("money.holderSub", { units: "25" }),
              amount: "125000",
              status: "paid",
            },
            {
              id: "c",
              kind: "holder",
              label: t("money.holder", { name: "C" }),
              sub: t("money.holderSub", { units: "65" }),
              amount: "325000",
              status: "paid",
            },
          ]}
          example
          sampleTx
        />
        <p className="mt-3 max-w-[62ch] text-sm text-n600">{t("money.lead")}</p>
      </section>

      {/* Task 91537: the plan-15 mechanics in plain language, each with a real devnet transaction from
          reports/demo-plan15.md (the run of 2026-10-09) instead of fixture signatures. */}
      <section className="mt-12">
        <h2 className="text-lg font-bold">{t("plan15.title")}</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-n600">
          {t("plan15.lead")}
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <section className="rounded-card border border-n200 bg-n0 p-5">
            <h3 className="font-bold text-n900">
              {t("plan15.register.title")}
            </h3>
            <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-n700">
              {t("plan15.register.body")}
            </p>
            <div className="mt-4">
              <ActionFlow
                locale={loc}
                steps={[
                  {
                    id: "ann",
                    label: t("plan15.register.l1"),
                    state: "done",
                    actor: "registrar",
                    tx: TX.announce,
                  },
                  { id: "gate", label: t("plan15.register.l2"), state: "done" },
                  {
                    id: "ex",
                    label: t("plan15.register.l3"),
                    state: "pending",
                  },
                ]}
              />
            </div>
          </section>

          <section className="rounded-card border border-n200 bg-n0 p-5">
            <h3 className="font-bold text-n900">{t("plan15.crank.title")}</h3>
            <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-n700">
              {t("plan15.crank.body")}
            </p>
            <div className="mt-4">
              <ActionFlow
                locale={loc}
                steps={[
                  {
                    id: "snap",
                    label: t("plan15.crank.l1"),
                    state: "done",
                    actor: "anyone",
                    tx: TX.snapshot,
                  },
                  {
                    id: "fin",
                    label: t("plan15.crank.l2"),
                    state: "done",
                    actor: "anyone",
                    tx: TX.finalize,
                  },
                  {
                    id: "pay",
                    label: t("plan15.crank.l3"),
                    state: "done",
                    actor: "anyone",
                    tx: TX.pay,
                  },
                  {
                    id: "done",
                    label: t("plan15.crank.l4"),
                    state: "done",
                    actor: "anyone",
                    tx: TX.complete,
                  },
                ]}
              />
            </div>
          </section>

          <section className="rounded-card border border-n200 bg-n0 p-5">
            <h3 className="font-bold text-n900">{t("plan15.late.title")}</h3>
            <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-n700">
              {t("plan15.late.body")}
            </p>
            <div className="mt-4">
              <ActionFlow
                locale={loc}
                steps={[
                  { id: "due", label: t("plan15.late.l1"), state: "done" },
                  { id: "grace", label: t("plan15.late.l2"), state: "done" },
                  {
                    id: "def",
                    label: t("plan15.late.l3"),
                    state: "defaulted",
                    actor: "anyone",
                    tx: TX.declare,
                  },
                  {
                    id: "cure",
                    label: t("plan15.late.l4"),
                    state: "done",
                    actor: "issuer",
                    tx: TX.fund,
                  },
                ]}
              />
            </div>
          </section>

          <section className="rounded-card border border-n200 bg-n0 p-5">
            <h3 className="font-bold text-n900">{t("plan15.bank.title")}</h3>
            <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-n700">
              {t("plan15.bank.body")}
            </p>
            <div className="mt-4">
              <ActionFlow
                locale={loc}
                steps={[
                  {
                    id: "route",
                    label: t("plan15.bank.l1"),
                    state: "done",
                    actor: "holder",
                  },
                  {
                    id: "agent",
                    label: t("plan15.bank.l2"),
                    state: "done",
                    actor: "anyone",
                    tx: TX.pay,
                  },
                  {
                    id: "confirm",
                    label: t("plan15.bank.l3"),
                    state: "done",
                    actor: "payingAgent",
                    tx: TX.confirmBank,
                    detail: <ProvenanceChip kind="simulated" />,
                  },
                  {
                    id: "done",
                    label: t("plan15.bank.l4"),
                    state: "done",
                    actor: "anyone",
                    tx: TX.complete,
                  },
                ]}
              />
            </div>
          </section>

          <section className="rounded-card border border-n200 bg-n0 p-5">
            <h3 className="font-bold text-n900">
              {t("plan15.anchored.title")}
            </h3>
            <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-n700">
              {t("plan15.anchored.body")}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-card border border-n200 bg-n50 p-3 text-sm">
              <span className="font-bold text-n900">
                {t("plan15.anchored.file")}
              </span>
              <span aria-hidden className="text-n400">
                →
              </span>
              <span className="num text-n700">sha256 e45e9974cdf9304c…</span>
              <ProvenanceChip kind="onchain" href={explorer(TX.disclose)} />
            </div>
          </section>

          <section className="rounded-card border border-n200 bg-n0 p-5">
            <h3 className="font-bold text-n900">{t("plan15.accrued.title")}</h3>
            <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-n700">
              {t("plan15.accrued.body")}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-card border border-n200 bg-n50 p-3 text-sm text-n700">
              <span className="rounded-full border border-n200 bg-n0 px-2 text-micro font-bold text-n600">
                {t("plan15.accrued.days", { n: 18 })}
              </span>
              <Amount
                minor="500000"
                currency="tKZT"
                locale={loc}
                className="font-bold text-n900"
              />{" "}
              =
              <span>
                {t("plan15.accrued.clean")}{" "}
                <Amount minor="497500" currency="tKZT" locale={loc} />
              </span>
              +
              <span>
                {t("plan15.accrued.accruedLbl")}{" "}
                <Amount minor="2500" currency="tKZT" locale={loc} />
              </span>
              <Address value={TX.trade} kind="tx" />
            </div>
          </section>
        </div>
      </section>

      <section id="glossary" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-bold">{t("gloss.title")}</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-n600">{t("gloss.lead")}</p>
        <dl className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          {GLOSSARY.map((k) => (
            <div key={k} id={`term-${k}`} className="min-w-0 scroll-mt-24">
              <dt className="text-sm font-bold text-n900">{tg(`${k}.term`)}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-n700">
                {tg(`${k}.def`)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 rounded-card border border-n200 bg-n0 p-5 sm:p-6">
        <p className="max-w-[62ch] text-sm text-n700">{t("cta.lead")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/sandbox/new">{t("cta.sandbox")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/bonds">{t("cta.bonds")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
