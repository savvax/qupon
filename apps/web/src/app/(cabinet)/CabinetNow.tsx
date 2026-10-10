import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StableText } from "@/components/i18n/StableLabel";
import { StepNowBar } from "@/components/shell/StepNowBar";
import { Button } from "@/components/ui/Button";
import { CountdownClock } from "@/components/ui/CountdownClock";
import { NowBar } from "@/components/ui/NowBar";
import {
  type ActionDTO,
  listActions,
  listPublicSeries,
  listSeries,
  type SeriesDTO,
} from "@/lib/api";
import { FundButton } from "./issuer/_components/IssuerActions";
import { issuerSeries } from "./issuer/_components/data";

/** What needs a hand first: a default outranks everything, then money owed beats a routine snapshot; then the nearest date. */
const RANK: Record<string, number> = {
  // Preflight #10: the NowBar must lead with the emergency — StepNowBar renders Defaulted with tone="danger".
  Defaulted: -1,
  SnapshotComplete: 0,
  Settling: 1,
  Funded: 2,
  RecordStruck: 3,
  Retiring: 4,
  Announced: 5,
  VotingOpen: 6,
  Finalized: 7,
};

type Row = { a: ActionDTO; s: SeriesDTO };

async function openActions(series: SeriesDTO[]): Promise<Row[]> {
  const lists = await Promise.all(
    // one failing series never blocks the bar
    series.map((s) =>
      listActions(s.mint)
        .then((as) => as.map((a) => ({ a, s })))
        .catch(() => [] as Row[]),
    ),
  );
  return lists
    .flat()
    .filter(
      ({ a }) =>
        a.status in RANK &&
        !(a.status === "Finalized" && a.result !== "Approved"),
    )
    .sort(
      (x, y) =>
        RANK[x.a.status]! - RANK[y.a.status]! ||
        x.a.recordAt.localeCompare(y.a.recordAt),
    );
}

/**
 * The cabinet's NowBar (task 1531), rendered by the shell above every page: the next step of the most urgent open
 * action (registrar and issuer, from actionFlow.nextStep) or, for an investor, the meeting to vote in or the next
 * record date. Renders nothing when nothing is open. The action console has its own NowBar (one per page).
 */
export async function CabinetNow({
  role,
}: {
  role: "registrar" | "issuer" | "investor";
}) {
  const series = await (
    role === "issuer"
      ? issuerSeries()
      : role === "registrar"
        ? listSeries()
        : listPublicSeries()
  ).catch(() => [] as SeriesDTO[]);
  const rows = await openActions(series);
  const t = await getTranslations("kit.now");

  if (role === "investor") {
    const vote = rows.find(({ a }) => a.status === "VotingOpen");
    const record = rows
      .filter(
        ({ a }) =>
          a.status === "Announced" && Date.parse(a.recordAt) > Date.now(),
      )
      .sort((x, y) => x.a.recordAt.localeCompare(y.a.recordAt))[0];
    const pick = vote ?? record;
    if (!pick) return null;
    const { a, s } = pick;
    return (
      <div data-tour="now" className="md:mb-6">
        <NowBar
          dock="tabbar"
          title={
            <StableText
              template={
                t.raw(vote ? "investorVote" : "investorRecord") as string
              }
              values={{ ticker: s.ticker }}
            >
              {t(vote ? "investorVote" : "investorRecord", {
                ticker: s.ticker,
              })}
            </StableText>
          }
          detail={a.corpId}
          clock={
            vote && a.votingEndsAt ? (
              <CountdownClock to={a.votingEndsAt} label={t("gate.vote")} />
            ) : (
              <CountdownClock to={a.recordAt} label={t("gate.record")} />
            )
          }
          actors={vote ? ["holder"] : []}
          action={
            <Button asChild size="sm">
              <Link href={vote ? "/investor/meetings" : `/bonds/${s.mint}`}>
                {t(vote ? "vote" : "viewBond")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const first = rows[0];
  if (!first) return null;
  const { a, s } = first;
  const fund = role === "issuer" && a.status === "SnapshotComplete";
  return (
    <div data-tour="now" className="md:mb-6">
      <StepNowBar
        action={a}
        ticker={s.ticker}
        supply={BigInt(s.totalIssued)}
        openTrades={s.openTrades ?? 0}
        button={
          fund ? (
            <FundButton pda={a.pda} />
          ) : (
            <Button
              asChild
              size="sm"
              variant={role === "issuer" ? "secondary" : "primary"}
            >
              <Link
                href={
                  role === "issuer"
                    ? `/issuer/series/${s.mint}`
                    : `/registrar/actions/${a.pda}`
                }
              >
                {t(role === "issuer" ? "openSeries" : "open")}
              </Link>
            </Button>
          )
        }
      />
    </div>
  );
}
