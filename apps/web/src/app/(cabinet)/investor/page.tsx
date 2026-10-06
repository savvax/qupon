import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { InvestorIdentity } from "./_components/InvestorIdentity";
import { OnboardingBanner } from "./_components/OnboardingBanner";
import { PortfolioView } from "./_components/PortfolioHeader";
import { DEMO_INVESTOR } from "./_lib/demo";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("investor") };
}

/** Portfolio — wallet investors arrive without a session; demo investors use the custodial wallet. */
export default async function InvestorPortfolioPage() {
  const s = await getSession();
  const demoOwner =
    s && (s.role === "investor_demo" || s.role === "admin")
      ? DEMO_INVESTOR
      : null;
  return (
    <>
      {/* above the identity: a signed-up investor without a wallet still sees the next step */}
      <OnboardingBanner />
      <InvestorIdentity
        title={(await getTranslations("cabinet.menu"))("portfolio")}
        demoOwner={demoOwner}
      >
        <PortfolioView />
      </InvestorIdentity>
    </>
  );
}
