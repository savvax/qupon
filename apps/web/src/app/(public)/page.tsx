import { Hero } from "./_landing/Hero";
import { LiveStrip } from "./_landing/LiveStrip";
import { loadLive } from "./_landing/live";
import {
  Audiences,
  HowItWorks,
  ImplementedVsSimulated,
  Scenarios,
} from "./_landing/sections";

export default async function Home() {
  const live = await loadLive();
  return (
    <>
      <Hero live={live} />
      <LiveStrip live={live} />
      <HowItWorks />
      <Scenarios />
      <Audiences />
      <ImplementedVsSimulated />
    </>
  );
}
