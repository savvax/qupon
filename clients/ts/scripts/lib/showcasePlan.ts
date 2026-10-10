/**
 * Pure plan builder for `make seed-showcase` (task 91542): turns the curated definitions in
 * config/showcase.json (generated from the Go Showcase table, services/registrar/internal/api/showcase.go)
 * into the CLI steps that create each series and drive it to the state its public dossier needs:
 * coupon → first coupon paid; redemption → redeemed and closed; meeting → voting open with two votes
 * cast; early_call → MCAL announced. No network here — scripts/seed-showcase.ts executes the plan;
 * showcasePlan.test.ts asserts it.
 */
import { addMonths, ymd, type Ymd } from "../../src/lib/daycount.js";

export type ShowcaseScenario =
  "coupon" | "redemption" | "meeting" | "early_call";

/** One curated series, as marshalled by the Go Showcase table into config/showcase.json. */
export interface ShowcaseDef {
  readonly scenario: ShowcaseScenario;
  readonly ticker: string;
  readonly isin: string;
  readonly faceMinor: number;
  readonly rateBps: number;
  readonly frequency: number;
  readonly maturityMonths: number;
  readonly daySecs: number;
}

/** The demo holder split everywhere (the brief): investor1 / investor2 / investor3. */
export const SHOWCASE_UNITS = [10, 25, 65] as const;

/** One plan step: a CLI invocation (`args`) or a wait for the open action's record/payment date. */
export interface PlanStep {
  readonly label: string;
  readonly args?: readonly string[];
  readonly wait?: "record" | "payment";
}

export interface SeriesPlan {
  readonly def: ShowcaseDef;
  /** Config/CLI series name — doubles as the on-chain 16-byte ticker. */
  readonly name: string;
  /** True when the ISIN is already on chain (series:list): no steps, the runner skips it. */
  readonly skip: boolean;
  readonly steps: readonly PlanStep[];
}

export interface PlanOpts {
  /** Issue date "YYYY-MM-DD" — day 0 of the series' demo calendar. */
  readonly today: string;
  /** investor1..3 wallet addresses (kyc:attest / investor:register / vote targets). */
  readonly owners: readonly [string, string, string];
  /** ISINs already on chain (series:list) — those definitions are skipped (idempotent re-runs). */
  readonly existing?: ReadonlySet<string>;
  /** keypair resolver: env-var name → path (tests pass a placeholder). */
  readonly kp?: (envVar: string) => string;
}

const NAME_RE = /^[A-Za-z0-9-]{1,16}$/; // series:create / POST /issuer/series name rule

const fmt = (d: Ymd): string =>
  `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;

/**
 * The CLI-legal series name for a ticker. The on-chain ticker must be printable ASCII (no spaces),
 * so the curated titles "Almaty Power" &co. become "Almaty-Power" &co. — the hyphen reads on the
 * public board and passes the series:name rule unchanged.
 */
export function seriesNameOf(def: ShowcaseDef): string {
  const name = def.ticker.replaceAll(" ", "-");
  if (!NAME_RE.test(name)) {
    throw new Error(
      `ticker '${def.ticker}' → name '${name}' is not series:create-legal (1-16 chars A-Z a-z 0-9 -)`,
    );
  }
  return name;
}

/** The scenario steps after issuance; `name` is the series, `corp` builds its CORP ids. */
function scenarioSteps(
  def: ShowcaseDef,
  name: string,
  corp: (kind: string) => string,
  issue: Ymd,
  as: (envVar: string) => readonly string[],
): PlanStep[] {
  const series = ["--series", name] as const;
  const snapshot: PlanStep[] = [
    {
      label:
        "wait for the record date (the transfer-hook gate arms itself — no strike)",
      wait: "record",
    },
    {
      label: "action:snapshot — outsider (permissionless crank)",
      args: ["action:snapshot", ...series, ...as("QUPON_OUTSIDER_KEYPAIR")],
    },
    {
      label: "action:finalize-snapshot — outsider",
      args: [
        "action:finalize-snapshot",
        ...series,
        ...as("QUPON_OUTSIDER_KEYPAIR"),
      ],
    },
  ];
  switch (def.scenario) {
    case "coupon": // first coupon paid end to end
      return [
        {
          label: `action:announce INTR ${corp("INTR")} — the demo clock derives record/payment dates`,
          args: [
            "action:announce",
            ...series,
            "--kind",
            "INTR",
            "--corp-id",
            corp("INTR"),
            ...as("QUPON_REGISTRAR_KEYPAIR"),
          ],
        },
        ...snapshot,
        { label: "wait for the payment date", wait: "payment" },
        {
          label: "action:fund — issuer pre-funds the escrow",
          args: ["action:fund", ...series, ...as("QUPON_ISSUER_KEYPAIR")],
        },
        {
          label: "action:pay — holders paid from escrow",
          args: ["action:pay", ...series, ...as("QUPON_OUTSIDER_KEYPAIR")],
        },
        {
          label: "action:complete — reconciled",
          args: ["action:complete", ...series, ...as("QUPON_OUTSIDER_KEYPAIR")],
        },
      ];
    case "redemption": // redeemed, burned and closed at maturity
      return [
        {
          label: `action:announce REDM ${corp("REDM")} — principal + final coupon at maturity`,
          args: [
            "action:announce",
            ...series,
            "--kind",
            "REDM",
            "--corp-id",
            corp("REDM"),
            ...as("QUPON_REGISTRAR_KEYPAIR"),
          ],
        },
        ...snapshot,
        { label: "wait for the payment date", wait: "payment" },
        {
          label: "action:fund — issuer pre-funds the escrow",
          args: ["action:fund", ...series, ...as("QUPON_ISSUER_KEYPAIR")],
        },
        {
          label: "action:pay — pay and burn in one instruction",
          args: ["action:pay", ...series, ...as("QUPON_OUTSIDER_KEYPAIR")],
        },
        {
          label: "action:complete — reconciled",
          args: ["action:complete", ...series, ...as("QUPON_OUTSIDER_KEYPAIR")],
        },
        {
          label: "action:retire — burn every remaining unit",
          args: ["action:retire", ...series, ...as("QUPON_OUTSIDER_KEYPAIR")],
        },
        {
          label: "series:close — metadata REDEEMED, mint closed",
          args: ["series:close", ...series, ...as("QUPON_REGISTRAR_KEYPAIR")],
        },
      ];
    case "meeting": // voting open, two of three votes cast (never finalized)
      return [
        {
          label: `meeting:announce ${corp("BMET")} — issuer proposes 12% (voting stays open)`,
          args: [
            "meeting:announce",
            ...series,
            "--record-at",
            "+30",
            "--voting-ends-at",
            "+5400",
            "--new-rate-bps",
            "1200",
            "--corp-id",
            corp("BMET"),
            ...as("QUPON_ISSUER_KEYPAIR"),
          ],
        },
        ...snapshot,
        {
          label: "vote For — investor3 (65 bonds)",
          args: [
            "vote",
            ...series,
            "--choice",
            "for",
            ...as("QUPON_INVESTOR3_KEYPAIR"),
          ],
        },
        {
          label: "vote Against — investor2 (25 bonds)",
          args: [
            "vote",
            ...series,
            "--choice",
            "against",
            ...as("QUPON_INVESTOR2_KEYPAIR"),
          ],
        },
      ];
    case "early_call": // MCAL announced; the dossier shows the notice
      return [
        {
          label: `action:announce MCAL ${corp("MCAL")} — call on ${fmt(addMonths(issue, Math.floor(def.maturityMonths / 2)))} (before the first coupon)`,
          args: [
            "action:announce",
            ...series,
            "--kind",
            "MCAL",
            "--call-date",
            fmt(addMonths(issue, Math.floor(def.maturityMonths / 2))),
            "--corp-id",
            corp("MCAL"),
            ...as("QUPON_REGISTRAR_KEYPAIR"),
          ],
        },
      ];
  }
}

/** The full seed plan, in board order (config/showcase.json order = the Go Showcase table order). */
export function buildShowcasePlan(
  defs: readonly ShowcaseDef[],
  opts: PlanOpts,
): SeriesPlan[] {
  const kp = opts.kp ?? ((v: string) => `$${v}`);
  const as = (v: string): readonly string[] => ["--keypair", kp(v)];
  const [y, m, d] = opts.today.split("-").map(Number);
  const issue = ymd(y ?? 0, m ?? 0, d ?? 0);
  return defs.map((def, i) => {
    const name = seriesNameOf(def);
    const maturity = fmt(addMonths(issue, def.maturityMonths));
    const corp = (kind: string): string => `SHOW${i + 1}-${kind}-0001`; // ≤ 16 bytes, the on-chain corp_id field
    const issuance: PlanStep[] = [
      {
        label: `series:create ${name} — face ${def.faceMinor}, ${def.rateBps} bps ×${def.frequency}/yr, ${opts.today} → ${maturity}, DEMO clock 1 day = ${def.daySecs} s`,
        args: [
          "series:create",
          "--name",
          name,
          "--isin",
          def.isin,
          "--face",
          String(def.faceMinor),
          "--rate-bps",
          String(def.rateBps),
          "--frequency",
          String(def.frequency),
          "--day-count",
          "THIRTY_360",
          "--issue-date",
          opts.today,
          "--maturity-date",
          maturity,
          "--cash",
          "tkzt",
          "--demo-day-secs",
          String(def.daySecs),
          ...as("QUPON_REGISTRAR_KEYPAIR"),
        ],
      },
      ...opts.owners.flatMap((owner, k): PlanStep[] => [
        {
          label: `kyc:attest investor${k + 1} — SIMULATED KYC provider`,
          args: [
            "kyc:attest",
            "--owner",
            owner,
            ...as("QUPON_KYC_PROVIDER_KEYPAIR"),
          ],
        },
        {
          label: `investor:register investor${k + 1}`,
          args: [
            "investor:register",
            "--series",
            name,
            "--owner",
            owner,
            ...as("QUPON_REGISTRAR_KEYPAIR"),
          ],
        },
      ]),
      ...SHOWCASE_UNITS.map((units, k): PlanStep => ({
        label: `subscribe ${units} bonds — investor${k + 1}`,
        args: [
          "subscribe",
          "--series",
          name,
          "--units",
          String(units),
          ...as(`QUPON_INVESTOR${k + 1}_KEYPAIR`),
        ],
      })),
    ];
    const skip = opts.existing?.has(def.isin) ?? false;
    return {
      def,
      name,
      skip,
      steps: skip
        ? []
        : [...issuance, ...scenarioSteps(def, name, corp, issue, as)],
    };
  });
}
