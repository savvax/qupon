import { Hero } from "./_landing/Hero";
import { FlowSection } from "./_landing/FlowSection";
import { LiveStrip } from "./_landing/LiveStrip";
import { loadLive } from "./_landing/live";
import {
  Audiences,
  BeyondCoupon,
  HowItWorks,
  ImplementedVsSimulated,
  ProvenOnDevnet,
  Scenarios,
  Platform,
} from "./_landing/sections";

import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("home") };
}

export default async function Home() {
  const live = await loadLive();
  return (
    <>
      <Hero live={live} />
      <LiveStrip live={live} />
      <FlowSection live={live} />
      <ProvenOnDevnet />
      <BeyondCoupon />
      <HowItWorks />
      <Platform />
      <Scenarios />
      <Audiences />
      <ImplementedVsSimulated />
    </>
  );
}
