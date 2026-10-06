import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { LinkedWallet } from "@/components/account/WalletLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { listPublicSeries } from "@/lib/api";
import { boFetch } from "@/lib/bo";
import type { KycApplication, KycDocument } from "@/lib/kyc";
import { getSession } from "@/lib/session";
import { KycFlow } from "./KycFlow";

export async function generateMetadata() {
  const t = await getTranslations("kyc.investor");
  return { title: `${t("title")} · Qupon` };
}

/** Investor verification (spec §5.3): self-registered investors apply; demo and wallet-only visitors are told how. */
export default async function InvestorKycPage() {
  const t = await getTranslations("kyc.investor");
  const user = await getSession();

  const header = (
    <header className="mb-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-n600">{t("lead")}</p>
    </header>
  );

  if (!user || user.role !== "investor") {
    return (
      <div className="max-w-3xl">
        {header}
        <Card padding="lg">
          <h2 className="text-lg font-bold">
            {user?.isDemo ? t("gate.demoTitle") : t("gate.title")}
          </h2>
          <p className="mt-1 text-sm text-n600">
            {user?.isDemo ? t("gate.demoBody") : t("gate.body")}
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">{t("gate.signup")}</Link>
            </Button>
            {!user && (
              <Button asChild size="lg" variant="secondary">
                <Link href="/login?next=/investor/kyc">{t("gate.signin")}</Link>
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const [kyc, wallets, docs, series] = await Promise.all([
    boFetch<{ application: KycApplication | null }>("/me/kyc").catch(() => ({
      application: null,
    })),
    boFetch<{ wallets: LinkedWallet[] }>("/me/wallets").catch(() => ({
      wallets: [] as LinkedWallet[],
    })),
    boFetch<{ documents: KycDocument[] }>("/me/documents").catch(() => ({
      documents: [] as KycDocument[],
    })),
    listPublicSeries().catch(() => []),
  ]);

  return (
    <div className="max-w-3xl">
      {header}
      <KycFlow
        application={kyc.application}
        wallets={wallets.wallets}
        documents={docs.documents.filter(
          (d) => d.kind === "id_document" || d.kind === "proof_of_address",
        )}
        series={series
          .filter((s) => s.status === "Active")
          .map((s) => ({ mint: s.mint, ticker: s.ticker, isin: s.isin }))}
      />
    </div>
  );
}
