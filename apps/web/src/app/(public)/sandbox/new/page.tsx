import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { apiGet } from "@/lib/api";
import { SANDBOX_COOKIE, SANDBOX_ID } from "@/lib/sandbox";
import { SandboxStart } from "./SandboxStart";

export async function generateMetadata() {
  const t = await getTranslations("sandbox");
  return { title: t("meta"), robots: { index: false } };
}

/**
 * "Try it in 3 minutes": resume the visitor's sandbox (cookie) while it lives, else create one. `?fresh=1` always
 * creates (Start over); `?wallet=<address>` includes that wallet as a fourth holder. Creation runs in the browser,
 * so a link prefetch never creates anything.
 */
export default async function NewSandbox({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string; wallet?: string }>;
}) {
  const { fresh, wallet } = await searchParams;
  const id = (await cookies()).get(SANDBOX_COOKIE)?.value;
  if (!fresh && !wallet && id && SANDBOX_ID.test(id)) {
    const alive = await apiGet(`/demo/sandbox/${id}`).then(
      () => true,
      () => false,
    );
    if (alive) redirect(`/sandbox/${id}`);
  }
  return <SandboxStart fresh={!!fresh} wallet={wallet ?? null} />;
}
