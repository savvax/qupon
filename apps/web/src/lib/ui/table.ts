export type Bp = "sm" | "md" | "lg" | "2xl";
const ORDER: Record<Bp, number> = { sm: 0, md: 1, lg: 2, "2xl": 3 };

/** Columns visible at breakpoint `bp`: a column with `hideBelow: "md"` is hidden at "sm" and shown from "md" up. */
export function visibleColumns<T extends { hideBelow?: Bp }>(
  cols: T[],
  bp: Bp,
): T[] {
  return cols.filter((c) => !c.hideBelow || ORDER[bp] >= ORDER[c.hideBelow]);
}

// Literal class names: Tailwind only generates classes it can find verbatim in the source.
const SHOWN_FROM: Record<Bp, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  "2xl": "hidden 2xl:table-cell",
};

/** Tailwind classes that show a cell only from its `hideBelow` breakpoint up (table cells only). */
export function cellShownFrom(bp: Bp): string {
  return SHOWN_FROM[bp];
}
