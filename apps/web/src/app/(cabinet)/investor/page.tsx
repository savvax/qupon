import { getSession } from "@/lib/session";
import { InvestorIdentity } from "./_components/InvestorIdentity";
import { PortfolioView } from "./_components/PortfolioHeader";
import { DEMO_INVESTOR } from "./_lib/demo";

/** Portfolio — wallet investors arrive without a session; demo investors use the custodial wallet. */
export default async function InvestorPortfolioPage() {
  const s = await getSession();
  const demoOwner =
    s && (s.role === "investor_demo" || s.role === "admin")
      ? DEMO_INVESTOR
      : null;
  return (
    <InvestorIdentity demoOwner={demoOwner}>
      <PortfolioView />
    </InvestorIdentity>
  );
}
