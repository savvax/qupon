import { Hero } from "./_landing/Hero";
import { LiveStrip } from "./_landing/LiveStrip";
import { loadLive } from "./_landing/live";
import {
  Audiences,
  HowItWorks,
  ImplementedVsSimulated,
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
      <HowItWorks />
      <Platform />
      <Scenarios />
      <Audiences />
      <ImplementedVsSimulated />
    </>
  );
}
