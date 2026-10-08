/**
 * Hero background: one still brand-green field from the lower left over a faint grid. No drifting aurora,
 * no glow: the lifecycle card on the right is the only thing that moves.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -bottom-1/2 -left-1/4 size-[80%] rounded-full bg-[radial-gradient(closest-side,var(--color-g800),transparent)] opacity-70" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:linear-gradient(90deg,transparent,black_60%)]" />
    </div>
  );
}
