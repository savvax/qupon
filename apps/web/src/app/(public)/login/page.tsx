import { redirect } from "next/navigation";
import { safeNext } from "@/lib/boClient";
import { ROLE_HOME, getSession } from "@/lib/session";
import { DemoPanel, SignInCard } from "./LoginForm";
import { metaTitle } from "@/lib/meta";
import { getNetwork } from "@/lib/network";

export async function generateMetadata() {
  return { title: await metaTitle("login") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  const user = await getSession();
  if (user) redirect(next ?? ROLE_HOME[user.role]);
  const { demoLogin } = await getNetwork();
  return (
    <div className="mx-auto grid max-w-[1100px] gap-6 px-4 py-8 sm:px-6 sm:py-14 lg:grid-cols-[1fr_1.15fr] lg:items-stretch">
      <SignInCard next={next} />
      {demoLogin && (
        <div className="order-first lg:order-none">
          <DemoPanel next={next} />
        </div>
      )}
    </div>
  );
}
