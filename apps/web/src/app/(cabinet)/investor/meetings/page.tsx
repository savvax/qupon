import { getSession } from "@/lib/session";
import { InvestorIdentity } from "../_components/InvestorIdentity";
import { VotePanel } from "../_components/VotePanel";
import { DEMO_INVESTOR } from "../_lib/demo";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("investorMeetings") };
}

/** Open bondholder meetings — snapshot-weighted vote, wallet or demo custodial wallet. */
export default async function InvestorMeetingsPage() {
  const s = await getSession();
  const demoOwner =
    s && (s.role === "investor_demo" || s.role === "admin")
      ? DEMO_INVESTOR
      : null;
  return (
    <InvestorIdentity demoOwner={demoOwner}>
      <VotePanel />
    </InvestorIdentity>
  );
}
