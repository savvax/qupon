import { StableText } from "@/components/i18n/StableLabel";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/shell/icons";
import { cx } from "@/lib/ui/cx";

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
      <p className="mt-5 max-w-[65ch] text-sm text-n500">
        <StableText>{t("note")}</StableText>
      </p>
    </Section>
  );
}
