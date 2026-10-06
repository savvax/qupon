/**
 * Hero background: three soft colour fields drifting slowly (aurora), the grid moving one cell per loop and a
 * light band sweeping across it. Transforms and opacity only; frozen by the global reduced-motion rule.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Iridescence: two soft conic fields turning in opposite directions; where they overlap the hues shift. */}
      <div className="absolute top-1/2 left-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2 blur-3xl [mask-image:radial-gradient(closest-side,transparent_4%,black_30%,black_48%,transparent_80%)]">
        <div className="animate-qp-iris-a absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#0b7a43,#11a39a_60deg,#1e6fd0_120deg,#16b46a_190deg,#0d8f8a_260deg,#57d18c_310deg,#0b7a43)] opacity-55 mix-blend-screen" />
        <div className="animate-qp-iris-b absolute inset-[12%] rounded-full bg-[conic-gradient(from_90deg,transparent,#2ad2c9_70deg,transparent_140deg,#7be3a5_220deg,transparent_290deg)] opacity-35 mix-blend-screen" />
      </div>
      <div className="animate-qp-aurora-a absolute -top-1/3 right-[-15%] size-[70%] rounded-full bg-[radial-gradient(closest-side,var(--color-p500),transparent)] opacity-70" />
      <div className="animate-qp-aurora-b absolute -bottom-1/2 -left-1/4 size-[80%] rounded-full bg-[radial-gradient(closest-side,var(--color-g700),transparent)] opacity-80" />
      <div className="animate-qp-aurora-c absolute top-1/4 left-1/3 size-[45%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-g500)_45%,transparent),transparent)] opacity-60" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:28px_28px] sm:animate-qp-hero-drift" />
      <div className="animate-qp-sweep absolute inset-y-0 -left-1/3 w-1/3 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,.07),transparent)]" />
    </div>
  );
}
