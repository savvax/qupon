/** Qupon mark: a green coupon — rounded square with a notch on each side. */
export function Logo({ size = 26 }: { size?: 20 | 26 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M6 0H20A6 6 0 0 1 26 6V10A3 3 0 0 0 26 16V20A6 6 0 0 1 20 26H6A6 6 0 0 1 0 20V16A3 3 0 0 0 0 10V6A6 6 0 0 1 6 0Z"
        fill="var(--color-g600)"
      />
      <path
        d="M9 8.5h8M9 13h8M9 17.5h5"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
