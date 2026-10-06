import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { InvestorIdentity } from "../_components/InvestorIdentity";
import { Statements } from "../_components/Statements";
import { DEMO_INVESTOR } from "../_lib/demo";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("investorStatements") };
}

/** Payout statements with seev.036 (ISO 20022) downloads and payment tx links. */
export default async function InvestorStatementsPage() {
  const s = await getSession();
  const demoOwner =
    s && (s.role === "investor_demo" || s.role === "admin")
      ? DEMO_INVESTOR
      : null;
  return (
    <InvestorIdentity
      title={(await getTranslations("cabinet.menu"))("statements")}
      demoOwner={demoOwner}
      selfRegistered={s?.role === "investor"}
    >
      <Statements />
    </InvestorIdentity>
  );
}
