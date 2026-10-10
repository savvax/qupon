import { StableText } from "@/components/i18n/StableLabel";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/shell/icons";
import { cx } from "@/lib/ui/cx";
import { DEMO_SERIES } from "@/lib/proof/demoSeries";

const CONTAINER = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";

/** Eyebrows are rationed (at most one per three sections), so most sections pass none. */
function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`${CONTAINER} scroll-mt-20 py-16 sm:py-24`}>
      {eyebrow && (
        <div className="mb-2 text-sm font-bold tracking-wider text-g700 uppercase">
          <StableText>{eyebrow}</StableText>
        </div>
      )}
      <h2 className="qp-reveal max-w-3xl text-2xl font-extrabold tracking-tight text-balance sm:text-[2rem] sm:leading-tight">
        <StableText>{title}</StableText>
      </h2>
      <div className="qp-reveal mt-10 sm:mt-12">{children}</div>
    </section>
  );
}

const STEPS = ["register", "record", "entitle", "pay", "report"] as const;

/** A timeline, not five cards: one rail across the steps that fills as the section scrolls in. */
export function HowItWorks() {
  const t = useTranslations("landing.how");
  return (
    <Section id="how" title={t("title")}>
      <div className="relative">
        <div
          aria-hidden
          className="absolute top-[5px] right-0 left-0 hidden h-px bg-n200 lg:block"
        >
          <div className="qp-rail h-full origin-left bg-g600" />
        </div>
        <ol className="grid gap-x-8 gap-y-8 border-l border-n200 pl-6 lg:grid-cols-5 lg:border-l-0 lg:pl-0">
          {STEPS.map((s, i) => (
            <li key={s} className="relative lg:pt-8">
              <span
                aria-hidden
                className="qp-step-num absolute top-1.5 -left-[29px] size-[11px] rounded-full border-2 border-g600 bg-n0 lg:top-0 lg:left-0"
                style={{ "--i": i } as React.CSSProperties}
              />
              <h3 className="font-bold text-n900">
                <StableText>{t(`${s}.title`)}</StableText>
              </h3>
              <p className="mt-1.5 max-w-[32ch] text-sm leading-relaxed text-n600">
                <StableText>{t(`${s}.text`)}</StableText>
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/** Bento: two wide tinted tiles carry the weight, four plain ones fill the rhythm (6 items, 6 cells). */
const PLATFORM = [
  { key: "accounts", icon: "shield", span: "lg:col-span-2", tone: "deep" },
  { key: "kase", icon: "building", span: "", tone: "plain" },
  { key: "tenge", icon: "coins", span: "", tone: "tint" },
  { key: "notify", icon: "bell", span: "", tone: "plain" },
  { key: "admin", icon: "server", span: "", tone: "plain" },
  { key: "mainnet", icon: "globe", span: "lg:col-span-3", tone: "line" },
] as const;

const TILE = {
  deep: "bg-p900 text-white [&_p]:text-p100 [&_.qp-ico]:bg-white/10 [&_.qp-ico]:text-g300",
  tint: "bg-g50 border border-g100 [&_.qp-ico]:bg-g600 [&_.qp-ico]:text-white",
  plain: "bg-n0 border border-n200 [&_.qp-ico]:bg-n100 [&_.qp-ico]:text-g700",
  line: "bg-n50 border border-n200 lg:flex lg:items-center lg:gap-6 [&_.qp-ico]:bg-n0 [&_.qp-ico]:text-g700 [&_.qp-ico]:ring-1 [&_.qp-ico]:ring-n200",
} as const;

export function Platform() {
  const t = useTranslations("landing.platform");
  return (
    <Section id="platform" title={t("title")}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORM.map((f) => (
          <li
            key={f.key}
            className={cx(
              "qp-reveal qp-lift rounded-card p-6 sm:p-7",
              f.span,
              f.key === "mainnet" && "sm:col-span-2",
              TILE[f.tone],
            )}
          >
            <span className="qp-ico grid size-10 shrink-0 place-items-center rounded-xl">
              <Icon name={f.icon} className="size-5" />
            </span>
            <div className={f.tone === "line" ? "mt-4 lg:mt-0" : "mt-5"}>
              <h3
                className={cx(
                  "font-bold",
                  f.tone === "deep" ? "text-xl" : "text-lg",
                )}
              >
                <StableText>{t(`${f.key}.title`)}</StableText>
              </h3>
              <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-n600">
                <StableText>{t(`${f.key}.text`)}</StableText>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const SCENARIOS = [
  { key: "coupon", code: "INTR", tone: "success" },
  { key: "redemption", code: "REDM", tone: "info" },
  { key: "meeting", code: "BMET", tone: "violet" },
  { key: "early", code: "MCAL", tone: "warn" },
] as const;

/** The ISO 20022 code is the visual: large mono type on the left, the plain-language story on the right. */
export function Scenarios() {
  const t = useTranslations("landing.scenarios");
  return (
    <div className="bg-n0">
      <Section eyebrow={t("eyebrow")} title={t("title")}>
        <dl className="grid gap-x-12 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <div
              key={s.key}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-5 border-t border-n200 py-6"
            >
              <dt className="font-mono text-2xl font-bold tracking-tight text-g700">
                {s.code}
              </dt>
              <dd>
                <h3 className="font-bold text-n900">
                  <StableText>{t(`${s.key}.title`)}</StableText>
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-n600">
                  <StableText>{t(`${s.key}.text`)}</StableText>
                </p>
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

function Check({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={`mt-0.5 size-5 shrink-0 ${className}`}
    >
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity=".14" />
      <path
        d="m6 10.5 2.5 2.5L14 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Issuers on the deep brand surface, investors on the light one: two audiences, two clearly different doors. */
export function Audiences() {
  const t = useTranslations("landing.audiences");
  return (
    <section className={`${CONTAINER} grid gap-4 pt-4 lg:grid-cols-2`}>
      {(["issuers", "investors"] as const).map((a) => {
        const dark = a === "issuers";
        return (
          <div
            key={a}
            id={a}
            className={cx(
              "qp-reveal flex scroll-mt-20 flex-col rounded-hero p-7 sm:p-10",
              dark ? "bg-p900 text-white" : "border border-n200 bg-g50",
            )}
          >
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              <StableText>{t(`${a}.title`)}</StableText>
            </h2>
            <ul className="mt-6 flex-1 space-y-3">
              {(["b1", "b2", "b3"] as const).map((b) => (
                <li
                  key={b}
                  className={cx("flex gap-3", dark ? "text-p100" : "text-n700")}
                >
                  <Check className={dark ? "text-g300" : "text-g600"} />
                  {t(`${a}.${b}`)}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3 min-[480px]:flex-row">
              <Button asChild variant={dark ? "primaryOnDark" : "primary"}>
                <Link href="/login?choose=1">{t(`${a}.cta`)}</Link>
              </Button>
              {a === "investors" && (
                <Button asChild variant="secondary">
                  <Link href="/signup">{t("investors.signup")}</Link>
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Evidence block (task 91538). Facts from reports/verified-build.md and the demo runs of 2026-10-09
 *  (reports/demo-plan15.md: 28 txs, reports/demo-full.md: 60 txs) — update them with the next verified deploy. */
const PROGRAM_ID = "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd";
const BUILD_HASH =
  "4a2e46778847f8b6277194a74ee89e9145fc8c03f8e4e8c9ede3bdda752a3505";
const VERIFY_CMD = [
  "cargo install solana-verify --locked",
  "solana-verify verify-from-repo https://github.com/savvax/qupon \\",
  `  --program-id ${PROGRAM_ID} \\`,
  "  --library-name qupon_bonds \\",
  "  --base-image solanafoundation/solana-verifiable-build:4.3.0",
].join("\n");
const PLAN15_TXS = 28;
const FULL_TXS = 60;
const VERIFIED_BUILD_URL =
  "https://github.com/savvax/qupon/blob/main/reports/verified-build.md";
const PROOF_MINT = DEMO_SERIES.find((d) => d.key === "plan15")!.mint;

/** "Proven on devnet": the verified build hash, the one command that reproduces it, and the demo-run counts. */
export function ProvenOnDevnet() {
  const t = useTranslations("landing.proven");
  const fact = (label: string, value: ReactNode) => (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-n600">
        <StableText>{label}</StableText>
      </dt>
      <dd className="mt-0.5 text-sm font-bold break-words text-n900">
        {value}
      </dd>
    </div>
  );
  return (
    <Section id="proven" title={t("title")}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 rounded-card border border-g100 bg-g50 p-6 sm:p-7">
          <ProvenanceChip kind="verified" />
          <dl className="mt-5 space-y-5">
            {fact(
              t("hashLabel"),
              <span className="num break-all">{BUILD_HASH}</span>,
            )}
            {fact(
              t("demosLabel"),
              <span className="num">
                <StableText
                  template={t.raw("plan15") as string}
                  values={{ n: PLAN15_TXS }}
                >
                  {t("plan15", { n: PLAN15_TXS })}
                </StableText>
                <br />
                <StableText
                  template={t.raw("full") as string}
                  values={{ n: FULL_TXS }}
                >
                  {t("full", { n: FULL_TXS })}
                </StableText>
              </span>,
            )}
          </dl>
          <p className="mt-5 max-w-[58ch] text-sm leading-relaxed text-n700">
            <StableText>{t("lead")}</StableText>
          </p>
          <div className="mt-6 flex flex-col gap-3 min-[480px]:flex-row">
            <Button asChild>
              <Link href={`/proof/${PROOF_MINT}`}>{t("cta")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <a href={VERIFIED_BUILD_URL} target="_blank" rel="noreferrer">
                {t("report")}
              </a>
            </Button>
          </div>
        </div>
        <div className="min-w-0 rounded-card border border-n200 bg-n0 p-6 sm:p-7">
          <h3 className="text-lg font-bold text-n900">
            <StableText>{t("commandTitle")}</StableText>
          </h3>
          <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-n600">
            <StableText>{t("commandText")}</StableText>
          </p>
          <pre className="mt-4 rounded-sm bg-p900 px-4 py-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-p100">
            {VERIFY_CMD}
          </pre>
          <p className="mt-3 text-xs text-n600">
            <StableText>{t("commandNote")}</StableText>
          </p>
        </div>
      </div>
    </Section>
  );
}

/** Plan-15 mechanics, one devnet tx each (reports/demo-plan15.md); `step` is the demo step name, `anchor` the /learn section. */
const BEYOND = [
  {
    key: "default",
    icon: "bell",
    anchor: "default",
    step: "action:default",
    tx: "2BvYuaWjSbNxVv3Lb618fTsxeWcNeM8DxZt8Kde33bdXJDLLUhxRs8uWMMAuExaVnf4ERePP75bp2fRGjfgFiBGF",
  },
  {
    key: "bank",
    icon: "bank",
    anchor: "bank-route",
    step: "payout:route",
    tx: "xxNBG1YLimYpDwtX2waTBzGR8q33tpSJZs1Ex6w22hFZf8YMkZyNcJAqut27sMWT8igLgvjeFmyjZhB6d3pxET4",
    simulated: true,
  },
  {
    key: "crank",
    icon: "plus",
    anchor: "crank",
    step: "action:snapshot",
    tx: "5PKcFSJjmkVbDCiYAS7x2aNUvcqtuyVTyEencPssGbwV5hfdZ5Fw77p2bN4mmGf4w3JjNX4q8GKKfKZY48sZwZW8",
  },
  {
    key: "accrued",
    icon: "coins",
    anchor: "accrued",
    step: "trade:create",
    tx: "5inUUPFvRRdDQW9YDur9q544kbKL38MrhRC3a1r49xCwsL4NQFKvJnWtiZAAJxccKmnSUYCJt4TJgLsDRzCDZ7BA",
  },
  {
    key: "notice",
    icon: "statements",
    anchor: "anchored-notice",
    step: "disclosure:attach",
    tx: "3dsJLizw1ufUAVjDZmtuKoigzyyfcM1smBKojW6MmvGYZcnZW4zLF2RPVa6JQL7TpYuTSWLM8PHtSTAjhWnu3aLg",
  },
] as const;

/** "Beyond a coupon": the plan-15 highlights, each with its /learn section and one real devnet tx. */
export function BeyondCoupon() {
  const t = useTranslations("landing.beyond");
  return (
    <div className="bg-n0">
      <Section id="beyond" title={t("title")}>
        <p className="-mt-6 mb-8 max-w-[65ch] text-n700">
          <StableText>{t("lead")}</StableText>
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BEYOND.map((b) => (
            <li
              key={b.key}
              className="qp-reveal qp-lift flex flex-col rounded-card border border-n200 bg-n0 p-6"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="qp-ico grid size-10 shrink-0 place-items-center rounded-xl bg-n100 text-g700">
                  <Icon name={b.icon} className="size-5" />
                </span>
                <h3 className="font-bold text-n900">
                  <StableText>{t(`${b.key}.title`)}</StableText>
                </h3>
                {"simulated" in b && b.simulated && (
                  <ProvenanceChip kind="simulated" />
                )}
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-n600">
                <StableText>{t(`${b.key}.text`)}</StableText>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-n100 pt-4 text-sm">
                <Link
                  href={`/learn#${b.anchor}`}
                  className="font-semibold text-g700 underline decoration-g300 underline-offset-2 hover:decoration-g600"
                >
                  {t("learn")}
                </Link>
                <a
                  href={`https://explorer.solana.com/tx/${b.tx}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="num font-mono text-xs font-semibold text-n600 underline decoration-n300 underline-offset-2 hover:text-n900"
                >
                  {b.step} ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
/** Nine rows grouped by provenance into three columns, each headed by the chip used next to features site-wide. */
const GROUPS = [
  { tone: "success", chip: "onchain", keys: ["core", "trades"] },
  { tone: "warn", chip: "simulated", keys: ["cash", "kyc", "iso", "notice"] },
  { tone: "neutral", chip: "roadmap", keys: ["ardfm", "mainnet", "squads"] },
] as const;

export function ImplementedVsSimulated() {
  const t = useTranslations("landing.simulated");
  return (
    <Section id="simulated" title={t("title")}>
      <ScopeGrid />
    </Section>
  );
}

/** The implemented-vs-simulated grid; one copy (landing.simulated) shared by the landing and the proof page. */
export function ScopeGrid() {
  const t = useTranslations("landing.simulated");
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <div
            key={g.tone}
            className={cx(
              "rounded-card p-6",
              g.tone === "success"
                ? "border border-g100 bg-g50"
                : "border border-n200 bg-n0",
            )}
          >
            <div className="mb-5 border-b border-n200/70 pb-4">
              <ProvenanceChip kind={g.chip} />
              <p className="mt-2 text-sm text-n600">
                <StableText>{t(`groups.${g.chip}`)}</StableText>
              </p>
            </div>
            <ul className="space-y-6">
              {g.keys.map((k) => (
                <li key={k}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-n900">
                      {t(`rows.${k}.element`)}
                    </span>
                    <Badge tone={g.tone}>{t(`rows.${k}.badge`)}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-n600">
                    <StableText>{t(`rows.${k}.text`)}</StableText>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-5 max-w-[65ch] text-sm text-n600">
        <StableText>{t("note")}</StableText>
      </p>
    </>
  );
}
