/**
 * Coach-mark tours per role (task 1531). Each step is the `data-tour` name of the element it rings ("welcome" has
 * none); its copy is `learn.tour.<role>.<step>.{title,body}` in messages/{en,ru,kk}/learn.json. `Tour` starts one
 * by itself on the role's home page until it is finished or skipped, and the help menu restarts it.
 */
export const TOURS = {
  registrar: { home: "/registrar", steps: ["welcome", "now", "kpi", "pipeline", "alerts", "nav", "help"] },
  issuer: { home: "/issuer", steps: ["welcome", "now", "kpi", "todo", "latest", "nav", "help"] },
  investor: { home: "/investor", steps: ["welcome", "now", "checklist", "portfolio", "holdings", "nav", "help"] },
  sandbox: {
    home: "/sandbox/demo",
    steps: ["welcome", "now", "roles", "scenario", "rail", "steps", "money", "feed", "help"],
  },
} as const;

export type TourRole = keyof typeof TOURS;
