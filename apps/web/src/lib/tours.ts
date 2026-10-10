/**
 * Coach-mark tours per role (task 1531). Each step is the `data-tour` name of the element it rings ("welcome" has
 * none); its copy is `learn.tour.<role>.<step>.{title,body}` in messages/{en,ru,kk}/learn.json. `Tour` starts one
 * by itself on the role's home page until it is finished or skipped, and the help menu restarts it.
 */
export const TOURS = {
  // Steps follow the page's DOM: alerts lead the board, the pipeline follows (preflight #10); the
  // sandbox tells its story (steps) before its toys (scenarios) (preflight #11).
  registrar: {
    home: "/registrar",
    steps: ["welcome", "now", "kpi", "alerts", "pipeline", "nav", "help"],
  },
  issuer: {
    home: "/issuer",
    steps: ["welcome", "now", "kpi", "todo", "latest", "nav", "help"],
  },
  investor: {
    home: "/investor",
    steps: [
      "welcome",
      "now",
      "checklist",
      "portfolio",
      "holdings",
      "nav",
      "help",
    ],
  },
  sandbox: {
    // every visitor's own /sandbox/<id> is the sandbox's home (isTourHome); the help menu starts one here
    home: "/sandbox/new",
    steps: [
      "welcome",
      "now",
      "rail",
      "steps",
      "scenario",
      "money",
      "roles",
      "feed",
      "help",
    ],
  },
} as const;

export type TourRole = keyof typeof TOURS;

/** localStorage key of a tour's progress: the step index, or "done" once finished or skipped. */
export const tourKey = (role: TourRole) => `qupon.tour.${role}`;

/** Whether `path` is the page a role's tour belongs to: the role's home, or any visitor's own sandbox. */
export const isTourHome = (role: TourRole, path: string) =>
  role === "sandbox"
    ? /^\/sandbox\/(?!new$)[\w-]+$/.test(path)
    : path === TOURS[role].home;
