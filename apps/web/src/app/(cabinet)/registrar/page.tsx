import { getSession } from "@/lib/session";
import { Placeholder } from "../Placeholder";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("registrar") };
}

export default async function RegistrarHome() {
  const user = await getSession();
  return <Placeholder name={user?.name} legacyHref="/console" />;
}
