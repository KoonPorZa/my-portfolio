"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const beaconToken = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN?.trim() ?? "";
const liveViewerPathPattern = /^\/trip\/\d+\/live(?:\/.*)?$/;

export function CfWebAnalytics() {
  const pathname = usePathname();

  if (!beaconToken || isLiveViewerPath(pathname)) {
    return null;
  }

  return (
    <Script
      id="cf-web-analytics"
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: beaconToken })}
      strategy="afterInteractive"
    />
  );
}

function isLiveViewerPath(pathname: string | null): boolean {
  // Viewer links are opened directly, not SPA nav; Cloudflare automatic injection
  // must stay OFF so the beacon never sees the viewer token.
  return pathname ? liveViewerPathPattern.test(pathname) : false;
}
