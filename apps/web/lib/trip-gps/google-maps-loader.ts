/**
 * Lazy Google Maps JS loader (Phase 17).
 *
 * Injects <script src="https://maps.googleapis.com/maps/api/js?..."> exactly
 * once and resolves a promise when window.google.maps is ready. Guards against
 * double-injection. This module is imported ONLY by google-route-map.tsx, which
 * is itself behind a next/dynamic + feature-flag gate, so no Google script is
 * ever requested when the flag is off.
 */

let promise: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (promise) return promise;

  // Already loaded (e.g. hot-reload / second mount).
  if (typeof window !== "undefined" && window.google?.maps) {
    promise = Promise.resolve();
    return promise;
  }

  promise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("loadGoogleMaps must be called in a browser context"));
      return;
    }

    const SCRIPT_ID = "__trip_google_maps_js__";

    if (document.getElementById(SCRIPT_ID)) {
      // Script tag already injected — poll until google.maps is available.
      waitForGoogleMaps(resolve, reject);
      return;
    }

    const callbackName = "__tripGoogleMapsReady__";

    (window as unknown as Record<string, unknown>)[callbackName] = () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      resolve();
    };

    const src =
      `https://maps.googleapis.com/maps/api/js` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&libraries=geometry` +
      `&loading=async` +
      `&v=weekly` +
      `&callback=${callbackName}`;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      promise = null; // allow retry
      reject(new Error("Google Maps JS failed to load"));
    };

    document.head.appendChild(script);
  });

  return promise;
}

function waitForGoogleMaps(
  resolve: () => void,
  reject: (err: Error) => void,
  attempts = 0,
): void {
  if (window.google?.maps) {
    resolve();
    return;
  }

  if (attempts >= 100) {
    reject(new Error("Timed out waiting for Google Maps JS"));
    return;
  }

  setTimeout(() => waitForGoogleMaps(resolve, reject, attempts + 1), 100);
}
