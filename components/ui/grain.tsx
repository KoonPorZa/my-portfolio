// Fixed grain + scanline + vignette overlay. Pure CSS, sits above the page,
// never intercepts pointer events. Adds atmosphere so the dark bg isn't flat.
export function Grain() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]">
      <div className="grain absolute inset-0 opacity-[0.06]" />
      <div className="scanlines absolute inset-0 opacity-[0.35]" />
      <div className="vignette absolute inset-0" />
    </div>
  );
}
