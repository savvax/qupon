import { getSession } from "@/lib/session";
import { InvestorIdentity } from "../_components/InvestorIdentity";
import { PlacementForm } from "../_components/PlacementForm";
import { DEMO_INVESTOR } from "../_lib/demo";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("investorPlacement") };
}

/** Primary placement (DvP at par) — wallet or demo custodial wallet. */
export default async function InvestorPlacementPage() {
  const s = await getSession();
  const demoOwner =
    s && (s.role === "investor_demo" || s.role === "admin")
      ? DEMO_INVESTOR
      : null;
  return (
    <InvestorIdentity demoOwner={demoOwner}>
      <PlacementForm />
    </InvestorIdentity>
  );
}
