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

import { ScopedIntl } from "@/components/i18n/ScopedIntl";
import { metaTitle } from "@/lib/meta";

/** Only what the landing's client tree reads (task 91575): hero lifecycle, sections, money/provenance/glossary. */
const SCOPE = [
  "landing",
  "common",
  "status",
  "kit.money",
  "kit.prov",
  "kit.glossary",
] as const;

/** Stabilized texts only: Badge/Address read status/common but never stabilize them (task 91575). */
const MAP_SCOPE = ["landing", "kit.glossary", "kit.money", "kit.prov"] as const;

export async function generateMetadata() {
  return { title: await metaTitle("home") };
}

export default async function Home() {
  const live = await loadLive();
  return (
    <ScopedIntl paths={SCOPE} mapPaths={MAP_SCOPE}>
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
    </ScopedIntl>
  );
}
