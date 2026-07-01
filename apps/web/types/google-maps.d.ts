/**
 * Minimal ambient declarations for the Google Maps JS API (v=weekly).
 * Only the surfaces used by google-route-map.tsx are declared here.
 * No npm package — added to avoid @typescript-eslint/no-explicit-any on
 * window.google.maps references in the optional Google map component.
 *
 * Full types are available via @types/google.maps if the owner enables the
 * Google path and wants richer type checking; these stubs are sufficient for
 * the flag-off build where the code never runs.
 */

declare namespace google {
  namespace maps {
    class Map {
      constructor(mapDiv: HTMLElement, opts?: MapOptions);
      fitBounds(bounds: LatLngBounds, padding?: number | Padding): void;
    }

    class Polyline {
      constructor(opts?: PolylineOptions);
      setMap(map: Map | null): void;
    }

    class Marker {
      constructor(opts?: MarkerOptions);
      setMap(map: Map | null): void;
    }

    class LatLngBounds {
      constructor();
      extend(point: LatLngLiteral | LatLng): this;
    }

    interface LatLng {
      lat(): number;
      lng(): number;
    }

    interface LatLngLiteral {
      lat: number;
      lng: number;
    }

    interface MapOptions {
      center?: LatLngLiteral;
      zoom?: number;
      mapTypeId?: string;
      disableDefaultUI?: boolean;
      gestureHandling?: string;
    }

    interface PolylineOptions {
      path?: LatLng[] | LatLngLiteral[];
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
      map?: Map;
    }

    interface MarkerOptions {
      position?: LatLngLiteral;
      map?: Map;
      label?: string | MarkerLabel;
      title?: string;
    }

    interface MarkerLabel {
      text: string;
      color?: string;
      fontFamily?: string;
      fontSize?: string;
      fontWeight?: string;
    }

    interface Padding {
      top: number;
      right: number;
      bottom: number;
      left: number;
    }

    namespace geometry {
      namespace encoding {
        function decodePath(encodedPath: string): LatLng[];
      }
    }
  }
}
