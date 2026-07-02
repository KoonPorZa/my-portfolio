import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// OpenNext (Cloudflare): make Cloudflare env/bindings available during `next dev`.
// No-op outside local development, so a normal `next build` is unaffected.
initOpenNextCloudflareForDev();
