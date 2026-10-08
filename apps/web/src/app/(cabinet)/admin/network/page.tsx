import { getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Card } from "@/components/ui/Card";
import { boFetch } from "@/lib/bo";
import { getNetwork } from "@/lib/network";
import { cx } from "@/lib/ui/cx";

type Check = { key: string; ok: boolean; detail?: string };
type Readiness = {
  network: string;
  programId: string;
  mainnet: boolean;
  checks: Check[];
};

const MAINNET_STEPS = [
  "license",
  "build",
  "authority",
  "keys",
  "funding",
  "kzte",
  "rpc",
  "kyc",
  "monitoring",
] as const;

export async function generateMetadata() {
  const t = await getTranslations("network.admin");
  return { title: `${t("title")} · Qupon` };
}

/** Network profile, live readiness of this instance, and the static checklist for a mainnet launch (§5.1). */
export default async function AdminNetworkPage() {
  const t = await getTranslations("network.admin");
  const net = await getNetwork();
  const r = await boFetch<Readiness>("/admin/network/readiness").catch(
    () => null,
  );
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-n600">{t("lead")}</p>
      </header>

      <Card>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-n500">{t("network")}</dt>
            <dd className="mt-1 font-bold">{net.network}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-n500">{t("program")}</dt>
            <dd className="mt-1">
              <Address value={net.programId} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-n500">{t("demo")}</dt>
            <dd className="mt-1 font-bold">
              {net.demoLogin ? t("on") : t("off")}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("readiness")}</h2>
        {!r ? (
          <p className="mt-2 text-sm text-err-fg">{t("unavailable")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-n100">
            {r.checks.map((c) => {
              // "Demo sign-in off on mainnet" only applies to mainnet: on devnet it is neither passed nor failed.
              const na = c.key === "demo_login" && !r.mainnet;
              return (
                <li
                  key={c.key}
                  data-check={c.key}
                  data-ok={c.ok}
                  className="flex flex-wrap items-center gap-3 py-2.5"
                >
                  <span
                    aria-hidden
                    className={cx(
                      "grid size-5 place-items-center rounded-full text-[11px] font-bold text-white",
                      na ? "bg-n300" : c.ok ? "bg-g600" : "bg-err-fg",
                    )}
                  >
                    {na ? "–" : c.ok ? "✓" : "!"}
                  </span>
                  <span className={cx("font-semibold", na && "text-n500")}>
                    {t(`checks.${c.key}`)}
                  </span>
                  {(na || c.detail) && (
                    <span className="ml-auto min-w-0 truncate text-sm text-n500">
                      {na ? t("notApplicable") : c.detail}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("mainnetTitle")}</h2>
        <p className="mt-1 text-sm text-n600">{t("mainnetLead")}</p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
          {MAINNET_STEPS.map((k) => (
            <li key={k}>
              {t(`steps.${k}`)
                .split("`")
                .map((part, i) =>
                  i % 2 ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static split of one message
                    <code
                      key={i}
                      className="rounded bg-n100 px-1 font-mono text-[0.9em]"
                    >
                      {part}
                    </code>
                  ) : (
                    part
                  ),
                )}
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-card bg-n50 p-3 font-mono text-xs">
          ops/deploy-mainnet.sh
        </p>
      </Card>
    </div>
  );
}
