import { getSession } from "@/lib/session";
import { Placeholder } from "../Placeholder";

export default async function InvestorHome() {
  const user = await getSession();
  return <Placeholder name={user?.name} legacyHref="/portal" />;
}
