import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { SandboxShell } from "./SandboxShell";

export async function generateMetadata() {
  const t = await getTranslations("sandbox");
  return { title: t("meta"), robots: { index: false } };
}

/** /sandbox/<id>: the judge sandbox shell on fixture data (task 1530); the id names the sandbox. */
export default async function SandboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[\w-]{1,40}$/.test(id)) notFound();
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  return <SandboxShell locale={locale} />;
}
