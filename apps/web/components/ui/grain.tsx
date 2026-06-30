// Fixed grain + vignette overlay. Pure CSS, sits above the page, never
// intercepts pointer events. Adds atmosphere so the dark bg isn't flat.
// Note: scanlines were moved OFF this top layer — over photos (avatars) they
// read as banding. They now live faintly behind content (see globals body::before).
export function Grain() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]">
      <div className="grain absolute inset-0 opacity-[0.05]" />
      <div className="vignette absolute inset-0" />
    </div>
  );
}
