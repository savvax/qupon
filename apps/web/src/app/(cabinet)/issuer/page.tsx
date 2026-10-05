import { getSession } from "@/lib/session";
import { Placeholder } from "../Placeholder";

export default async function IssuerHome() {
  const user = await getSession();
  return <Placeholder name={user?.name} legacyHref="/console" />;
}
