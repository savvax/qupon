/**
 * The glossary (task 1531): every term of art the UI explains, in reading order (the life of a bond first, then
 * the plumbing). The plain-language en/ru/kk text lives with the other UI strings in
 * `messages/{en,ru,kk}/kit.json` → `kit.glossary.<key>.{term,def}`, so it ships only in the reader's locale and
 * the i18n parity test covers it. `GlossaryTerm` renders one entry; `/learn#glossary` lists them all.
 */
export const GLOSSARY = [
  "recordDate",
  "exDate",
  "coupon",
  "accrued",
  "cleanDirty",
  "ytm",
  "entitlement",
  "snapshot",
  "snapshotHash",
  "escrow",
  "taxVault",
  "payingAgent",
  "redemption",
  "earlyCall",
  "partialCall",
  "meeting",
  "quorum",
  "registrar",
  "permissionless",
  "transferHook",
  "tokenPause",
  "dvp",
  "default",
  "cure",
  "sas",
  "demoClock",
  "dayCount",
  "seev031",
  "seev036",
] as const;

export type GlossaryKey = (typeof GLOSSARY)[number];
