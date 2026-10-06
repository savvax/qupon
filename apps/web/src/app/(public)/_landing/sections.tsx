import { StableText } from "@/components/i18n/StableLabel";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const CONTAINER = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`${CONTAINER} scroll-mt-20 py-14 sm:py-20`}>
      <div className="text-sm font-bold tracking-wider text-g700 uppercase">
        <StableText>{eyebrow}</StableText>
      </div>
      <h2 className="mt-2 max-w-3xl text-2xl font-extrabold tracking-tight text-balance sm:text-[2rem] sm:leading-tight">
        <StableText>{title}</StableText>
      </h2>
      <div className="mt-8 sm:mt-10">{children}</div>
    </section>
  );
}

const STEPS = ["register", "record", "entitle", "pay", "report"] as const;

export function HowItWorks() {
  const t = useTranslations("landing.how");
  return (
    <Section id="how" eyebrow={t("eyebrow")} title={t("title")}>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={s} className="rounded-card border border-n200 bg-n0 p-5">
            <span className="flex size-8 items-center justify-center rounded-full bg-g600 text-sm font-bold text-white">
              {i + 1}
            </span>
            <h3 className="mt-4 font-bold">
              <StableText>{t(`${s}.title`)}</StableText>
            </h3>
            <p className="mt-1.5 text-sm text-n600">
              <StableText>{t(`${s}.text`)}</StableText>
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const SCENARIOS = [
  { key: "coupon", code: "INTR", tone: "success" },
  { key: "redemption", code: "REDM", tone: "info" },
  { key: "meeting", code: "BMET", tone: "violet" },
  { key: "early", code: "MCAL", tone: "warn" },
] as const;

export function Scenarios() {
  const t = useTranslations("landing.scenarios");
  return (
    <div className="border-y border-n200 bg-n0">
      <Section eyebrow={t("eyebrow")} title={t("title")}>
        <div className="grid gap-4 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <div
              key={s.key}
              className="rounded-card border border-n200 bg-n50 p-5 sm:p-6"
            >
              <Badge tone={s.tone}>{s.code}</Badge>
              <h3 className="mt-3 text-lg font-bold">
                <StableText>{t(`${s.key}.title`)}</StableText>
              </h3>
              <p className="mt-1.5 text-sm text-n600">
                <StableText>{t(`${s.key}.text`)}</StableText>
              </p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Check() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className="mt-0.5 size-5 shrink-0 text-g600"
    >
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity=".12" />
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

export function Audiences() {
  const t = useTranslations("landing.audiences");
  return (
    <section
      className={`${CONTAINER} grid gap-4 pt-14 sm:pt-20 lg:grid-cols-2`}
    >
      {(["issuers", "investors"] as const).map((a) => (
        <div
          key={a}
          id={a}
          className="flex scroll-mt-20 flex-col rounded-hero border border-n200 bg-n0 p-6 sm:p-8"
        >
          <h2 className="text-2xl font-extrabold tracking-tight">
            <StableText>{t(`${a}.title`)}</StableText>
          </h2>
          <ul className="mt-5 flex-1 space-y-3">
            {(["b1", "b2", "b3"] as const).map((b) => (
              <li key={b} className="flex gap-3 text-n700">
                <Check />
                {t(`${a}.${b}`)}
              </li>
            ))}
          </ul>
          <div className="mt-7">
            <Button asChild variant={a === "issuers" ? "primary" : "secondary"}>
              <Link href="/login">{t(`${a}.cta`)}</Link>
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

const ROWS = [
  { key: "core", tone: "success" },
  { key: "cash", tone: "warn" },
  { key: "kyc", tone: "warn" },
  { key: "iso", tone: "warn" },
  { key: "ardfm", tone: "neutral" },
  { key: "notice", tone: "warn" },
  { key: "squads", tone: "neutral" },
] as const;

export function ImplementedVsSimulated() {
  const t = useTranslations("landing.simulated");
  return (
    <Section id="simulated" eyebrow={t("eyebrow")} title={t("title")}>
      <div className="overflow-hidden rounded-card border border-n200 bg-n0">
        {ROWS.map((r, i) => (
          <div
            key={r.key}
            className={`grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] sm:gap-6 sm:px-6 ${i ? "border-t border-n200" : ""}`}
          >
            <div className="font-semibold text-n900">
              {t(`rows.${r.key}.element`)}
            </div>
            <div className="text-sm text-n600">
              <Badge tone={r.tone}>{t(`rows.${r.key}.badge`)}</Badge>
              <p className="mt-1.5">
                <StableText>{t(`rows.${r.key}.text`)}</StableText>
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-n500">
        <StableText>{t("note")}</StableText>
      </p>
    </Section>
  );
}
