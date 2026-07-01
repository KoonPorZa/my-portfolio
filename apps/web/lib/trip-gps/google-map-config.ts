/**
 * Feature-flag helpers for the optional Google motorcycle map (Phase 17).
 *
 * Both vars are NEXT_PUBLIC_* and therefore inlined at build time.
 * When the flag is OFF (default) the whole google-route-map chunk is never
 * imported and no maps.googleapis.com script is ever injected.
 */

export function googleMapEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_TRIP_GOOGLE_MAP_ENABLED === "1" &&
    !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
  );
}

export function googleMapsBrowserKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";
}
