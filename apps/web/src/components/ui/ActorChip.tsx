import { useTranslations } from "next-intl";
import { StableLabel } from "@/components/i18n/StableLabel";
import { cx } from "@/lib/ui/cx";

/** Who may perform a step. `anyone` = permissionless (any signer; the program enforces every rule). */
export type Actor =
  "anyone" | "issuer" | "registrar" | "holder" | "payingAgent";

/** One role pill. "Anyone" is the distinctive one: solid outline in brand green with an open-hand meaning "push". */
export function ActorChip({
  actor,
  long = false,
}: {
  actor: Actor;
  /** "Anyone can push" instead of "Anyone" (step lists, where the verb matters). */
  long?: boolean;
}) {
  const t = useTranslations("kit.actor");
  const anyone = actor === "anyone";
  return (
    <span
      title={anyone ? t("anyoneHint") : undefined}
      className={cx(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-micro font-bold whitespace-nowrap",
        // n300/n100/n800: on the near-white NowBar the old n200/n50/n700 pill read pale, as if disabled (preflight #29)
        anyone
          ? "border border-g600 bg-n0 text-g700"
          : "border border-n300 bg-n100 text-n800",
      )}
    >
      {anyone && (
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v6M5 8h6" />
        </svg>
      )}
      <StableLabel align="start">
        {anyone && long ? t("anyonePush") : t(actor)}
      </StableLabel>
    </span>
  );
}
