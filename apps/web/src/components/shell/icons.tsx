/** Nav icons (24 px, 1.75 stroke). Inline paths — no icon library for a dozen glyphs. */
const PATHS = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  series: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4",
  plus: "M12 5v14M5 12h14",
  users:
    "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.87M15.5 4.13a3.5 3.5 0 0 1 0 6.74",
  actions: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  autopilot: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  wallet:
    "M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 7l12-4v4M17 13.5h.01",
  placement: "M12 4v12m0 0-4-4m4 4 4-4M4 20h16",
  vote: "M5 4h14v16H5zM9 12l2 2 4-4",
  statements: "M7 3h10v18H7zM10 8h4M10 12h4M10 16h2",
  menu: "M4 7h16M4 12h16M4 17h16",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className = "size-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
