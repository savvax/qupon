"use client";

import { type ReactNode, createContext, useContext } from "react";
import { type AltLabelMap, fill } from "@/i18n/altLabels";

const Ctx = createContext<AltLabelMap>({});

/** Root-layout provider of the current → other-locale label map (see i18n/altLabels). */
export function AltLabelsProvider({
  map,
  children,
}: {
  map: AltLabelMap;
  children: ReactNode;
}) {
  return <Ctx.Provider value={map}>{children}</Ctx.Provider>;
}

export const useAltLabels = () => useContext(Ctx);

/**
 * A label that is as wide as the longer of its EN/RU versions, so switching the language never resizes or moves
 * the control around it. The other version sits invisibly in the same grid cell (`::after`, not in the
 * accessibility tree or textContent). Pass `template` + `values` for messages with placeholders.
 */
export function StableLabel({
  children,
  template,
  values,
  align = "center",
}: {
  children: string;
  template?: string;
  values?: Record<string, string | number>;
  align?: "center" | "start" | "end";
}) {
  const map = useAltLabels();
  const altTemplate = template ? map[template] : undefined;
  const alt = altTemplate ? fill(altTemplate, values) : map[children];
  if (!alt || alt === children) return <>{children}</>;
  return (
    <span className="stable-label" data-alt={alt} data-align={align}>
      <span>{children}</span>
    </span>
  );
}

/**
 * A text block (paragraph, heading, description) as tall as the longer of its EN/RU versions at the current
 * width, so the controls below it stay put when the language changes.
 */
export function StableText({
  children,
  values,
  template,
  className,
}: {
  children: string;
  template?: string;
  values?: Record<string, string | number>;
  className?: string;
}) {
  const map = useAltLabels();
  const altTemplate = template ? map[template] : undefined;
  const alt = altTemplate ? fill(altTemplate, values) : map[children];
  if (!alt || alt === children)
    return className ? (
      <span className={className}>{children}</span>
    ) : (
      <>{children}</>
    );
  return (
    <span className={`stable-text ${className ?? ""}`} data-alt={alt}>
      <span>{children}</span>
    </span>
  );
}

/** Wrap the plain-string parts of a control's children (icons and other elements pass through). */
export function stabilize(children: ReactNode): ReactNode {
  if (typeof children === "string")
    return children.trim() ? <StableLabel>{children}</StableLabel> : children;
  if (Array.isArray(children))
    return children.map((c, i) =>
      typeof c === "string" && c.trim() ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: static positional children
        <StableLabel key={i}>{c}</StableLabel>
      ) : (
        c
      ),
    );
  return children;
}
