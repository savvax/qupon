/**
 * Hero background: three soft colour fields drifting slowly (aurora), the grid moving one cell per loop and a
 * light band sweeping across it. Transforms and opacity only; frozen by the global reduced-motion rule.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="animate-qp-aurora-a absolute -top-1/3 right-[-15%] size-[70%] rounded-full bg-[radial-gradient(closest-side,var(--color-p500),transparent)] opacity-70" />
      <div className="animate-qp-aurora-b absolute -bottom-1/2 -left-1/4 size-[80%] rounded-full bg-[radial-gradient(closest-side,var(--color-g700),transparent)] opacity-80" />
      <div className="animate-qp-aurora-c absolute top-1/4 left-1/3 size-[45%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-g500)_45%,transparent),transparent)] opacity-60" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:28px_28px] sm:animate-qp-hero-drift" />
      <div className="animate-qp-sweep absolute inset-y-0 -left-1/3 w-1/3 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,.07),transparent)]" />
    </div>
  );
}
