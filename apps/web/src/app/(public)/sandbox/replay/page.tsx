import { getTranslations } from "next-intl/server";
import { ScopedIntl } from "@/components/i18n/ScopedIntl";
import { ReplayClient } from "./ReplayClient";

export async function generateMetadata() {
  const t = await getTranslations("sandbox");
  return { title: t("replay.meta"), robots: { index: false } };
}

/** task 91575: the same client namespaces the live sandbox page ships. */
const SCOPE = [
  "sandbox",
  "steps",
  "errors",
  "common",
  "status",
  "kit",
  "learn.help",
  "learn.tour.sandbox",
] as const;

/**
 * /sandbox/replay (task 91587): the recorded devnet run of apps/web/public/replay/sandbox.json played back with
 * the live sandbox UI. Client-side fetch only — the page itself never calls the registrar or any Solana RPC.
 */
export default function SandboxReplayPage() {
  return (
    <ScopedIntl paths={SCOPE}>
      <ReplayClient />
    </ScopedIntl>
  );
}
