import { altLabelMap, type AltLabelMap } from "./altLabels";
import { LOCALES, type Locale, loadMessages } from "./request";

/**
 * Route-scoped client payloads (task 91575): the root layout used to serialize EVERY namespace (and the alt-label
 * map built from all three locales) into every page's RSC payload — 468 KB of the 676 KB landing HTML. A route now
 * ships only the message paths its client tree reads; server components keep using the full set via getTranslations.
 */
export type MessageTree = Record<string, unknown>;

/** Deep-pick dot-separated `paths` (e.g. "wallet.button") out of a messages tree. */
export function pickMessages(
  tree: MessageTree,
  paths: readonly string[],
): MessageTree {
  const out: MessageTree = {};
  for (const path of paths) {
    const keys = path.split(".");
    let src: unknown = tree;
    let dst = out;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      if (!src || typeof src !== "object") break;
      const value = (src as MessageTree)[key];
      if (value === undefined) break;
      if (i === keys.length - 1) {
        dst[key] = value;
      } else {
        const next = (dst[key] ??= {}) as MessageTree;
        if (typeof next !== "object") break;
        src = value;
        dst = next;
      }
    }
  }
  return out;
}

export type ScopedIntl = { messages: MessageTree; altLabels: AltLabelMap };

/** The scoped messages plus the cross-locale alt-label map of exactly those paths. */
export async function scopedIntl(
  locale: Locale,
  paths: readonly string[],
  mapPaths: readonly string[] = paths,
): Promise<ScopedIntl> {
  const [current, alts] = await Promise.all([
    loadMessages(locale),
    Promise.all(
      LOCALES.filter((l) => l !== locale).map((l) => loadMessages(l)),
    ),
  ]);
  const messages = pickMessages(current, paths);
  const mapTree = pickMessages(current, mapPaths);
  return {
    messages,
    altLabels: altLabelMap(
      mapTree,
      ...alts.map((a) => pickMessages(a, mapPaths)),
    ),
  };
}
