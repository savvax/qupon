import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { toLocale } from "@/i18n/locale";
import { apiGet, MOCK_API } from "@/lib/api";
import { normalizeSandbox, type Sandbox, SANDBOX_ID } from "@/lib/sandbox";
import { Gone, SandboxView } from "./SandboxView";

export async function generateMetadata() {
  const t = await getTranslations("sandbox");
  return { title: t("meta"), robots: { index: false } };
}

/** /sandbox/<id>: the visitor's own demo-clock bond (task 1532); first paint from the server, then polled. */
export default async function SandboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!SANDBOX_ID.test(id)) notFound();
  if (id === "demo") redirect("/sandbox/new"); // the old shared link: everyone gets their own bond now
  const sandbox = await apiGet<Sandbox>(`/demo/sandbox/${id}`).catch((e: { status?: number }) => {
    if (e.status === 404) return null;
    throw e;
  });
  if (!sandbox)
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
        <Gone />
      </div>
    );
  return <SandboxView initial={normalizeSandbox(sandbox)} locale={toLocale(await getLocale())} mock={MOCK_API} />;
}
