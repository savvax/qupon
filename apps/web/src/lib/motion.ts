/** Motion tokens (platform v2 §5.6). Keep in step with the CSS --animate-qp-* tokens in globals.css. */
export const DUR = { fast: 0.12, base: 0.2, slow: 0.3, count: 0.7 } as const;
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
export const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const;

/**
 * Entrance animations run only after the first page has hydrated: on a full page load the server HTML is shown
 * as is (no opacity:0 flash, nothing hidden without JS); on client-side navigations new content animates in.
 */
export const motionState = { hydrated: false };
