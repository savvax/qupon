"use client";

/**
 * Bondholder meetings (Plan 3 Task 6 step 3): open meetings with the proposal,
 * the voter's snapshot weight, a segmented For/Against/Abstain choice with a
 * confirm dialog, and the tally.
 */

import { useWalletUX } from "@/components/wallet/WalletUX";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useWallet } from "@solana/wallet-adapter-react";
import { address } from "@solana/kit";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { boPost } from "@/lib/boClient";
import { bpsToPercent, formatDateTime } from "@/lib/format";
import {
  VOTE_CHOICES,
  buildVoteIx,
  openMeetings,
  type VoteChoiceName,
} from "@/lib/portal";
import { useRunWrite } from "@/lib/useRunWrite";
import {
  portalRpc,
  signAndSendWithWallet,
  walletTransactionSigner,
} from "@/lib/walletSigner";
import { useInvestor } from "./InvestorIdentity";
import { useWalletWrite } from "../_lib/useWalletWrite";
import { usePortalRows } from "../_lib/usePortalRows";

type DemoWriteResult = {
  demo?: boolean;
  ok?: boolean;
  signature?: string;
  signatures?: string[];
};
const txsOf = (r: DemoWriteResult): string[] =>
  r.signature ? [r.signature] : (r.signatures ?? []);

const CHOICES: VoteChoiceName[] = ["For", "Against", "Abstain"];

function MeetingCard({
  meeting,
  busy,
  onVote,
}: {
  meeting: ReturnType<typeof openMeetings>[number];
  busy: boolean;
  onVote: (choice: VoteChoiceName) => void;
}) {
  const t = useTranslations("investor.meetings");
  const { row, action } = meeting;
  const mine = row.entitlements.find((e) => e.actionPda === action.pda);
  const proposal =
    action.proposalNewRateBps !== null &&
    action.proposalNewRateBps !== undefined
      ? t("proposalRate", {
          from: bpsToPercent(row.series.couponRateBps),
          to: bpsToPercent(action.proposalNewRateBps),
        })
      : action.proposalNewMaturity
        ? t("proposalMaturity", { date: action.proposalNewMaturity })
        : t("proposalOther");
  const voted =
    mine?.vote && mine.vote !== "None" ? (mine.vote as VoteChoiceName) : null;
  const totalUnits = Number(action.unitsSnapshotted ?? "0");

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-n500">{action.corpId}</span>
            <Badge status={action.status} />
          </div>
          <p className="mt-1 text-base font-bold">
            {row.series.ticker} — {proposal}
          </p>
        </div>
        <span className="num text-xs text-n500">
          {t("votingEnds", { date: formatDateTime(action.votingEndsAt ?? "") })}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-n500">{t("yourWeight")} </span>
          <span className="num font-semibold">
            {mine ? t("units", { units: mine.units }) : t("notSnapshotted")}
          </span>
        </span>
        {voted && (
          <span className="flex items-center gap-1.5">
            <span className="text-n500">{t("alreadyVoted")}</span>
            <Badge status={voted} />
          </span>
        )}
        <Address value={action.pda} />
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-xs font-semibold text-n500">
          {t("castYourVote")}
        </span>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t("castYourVote")}
        >
          {CHOICES.map((c) => (
            <Button
              key={c}
              variant={
                c === "For"
                  ? "primary"
                  : c === "Against"
                    ? "destructive"
                    : "secondary"
              }
              disabled={busy || voted !== null}
              onClick={() => onVote(c)}
            >
              {t(`choice.${c}`)}
            </Button>
          ))}
        </div>
      </div>

      <p className="mt-4 num text-xs text-n500">
        {t("tally", {
          for: action.votesFor ?? "0",
          against: action.votesAgainst ?? "0",
          abstain: action.votesAbstain ?? "0",
          total: totalUnits,
        })}
      </p>
    </Card>
  );
}

/** The /investor/meetings page body inside <InvestorIdentity>. */
export function VotePanel() {
  const { mode, owner } = useInvestor();
  const { connect } = useWalletUX();
  const { wallet } = useWallet();
  const t = useTranslations("investor.meetings");
  const runWrite = useRunWrite();
  const runWalletWrite = useWalletWrite();
  const { rows, error, reload } = usePortalRows();

  const [confirm, setConfirm] = useState<{
    pda: string;
    choice: VoteChoiceName;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const castVote = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    const { pda, choice } = confirm;
    const done = () => {
      setBusy(false);
      setConfirm(null);
      reload();
    };
    if (mode === "watch") {
      setBusy(false);
      connect();
      return;
    }
    if (mode === "demo") {
      await runWrite({
        pending: t("toasts.voting", { choice: t(`choice.${choice}`) }),
        success: () => t("toasts.voted", { choice: t(`choice.${choice}`) }),
        call: () =>
          boPost<DemoWriteResult>("demo/investor/vote", {
            action: pda,
            choice: choice.toLowerCase(),
          }),
        txs: txsOf,
      });
      done();
      return;
    }
    const meeting = rows
      ? openMeetings(rows).find((m) => m.action.pda === pda)
      : undefined;
    if (!meeting || !wallet || !("signTransaction" in wallet.adapter)) {
      setBusy(false);
      setConfirm(null);
      return;
    }
    const signer = walletTransactionSigner(wallet.adapter, address(owner));
    await runWalletWrite({
      pending: t("toasts.voting", { choice: t(`choice.${choice}`) }),
      success: () => t("toasts.voted", { choice: t(`choice.${choice}`) }),
      call: async () => {
        const ix = await buildVoteIx(
          meeting.row.series.mint,
          address(pda),
          signer,
          VOTE_CHOICES[choice],
        );
        return signAndSendWithWallet(signer, portalRpc(), [ix]);
      },
    });
    done();
  };

  if (error) return <EmptyState title={t("loadFailed")} body={error} />;
  if (!rows) return <Skeleton className="h-64" />;
  const meetings = openMeetings(rows);
  if (meetings.length === 0) {
    return <EmptyState title={t("empty")} body={t("emptyBody")} />;
  }

  return (
    <div className="max-w-3xl space-y-4">
      {meetings.map((m) => (
        <MeetingCard
          key={m.action.pda}
          meeting={m}
          busy={busy}
          onVote={(choice) => setConfirm({ pda: m.action.pda, choice })}
        />
      ))}

      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => !busy && setConfirm(o ? confirm : null)}
        title={t("confirmTitle", {
          choice: confirm ? t(`choice.${confirm.choice}`) : "",
        })}
        description={t("confirmBody")}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {t("cancel")}
            </Button>
            <Button loading={busy} onClick={() => void castVote()}>
              {t("confirmVote")}
            </Button>
          </>
        }
      />
    </div>
  );
}
