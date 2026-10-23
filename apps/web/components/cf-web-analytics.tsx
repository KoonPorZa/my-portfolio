import Script from "next/script";

const beaconToken = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN?.trim() ?? "";

export function CfWebAnalytics() {
  if (!beaconToken) {
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
