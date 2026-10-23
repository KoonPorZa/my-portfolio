import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// SELF_HOST_BUILD=1 (Dockerfile) emits a standalone Node server; the Workers build leaves it unset.
const nextConfig: NextConfig = process.env.SELF_HOST_BUILD === "1"
  ? { output: "standalone", outputFileTracingRoot: path.join(__dirname, "../..") }
  : {};

export default nextConfig;

// OpenNext (Cloudflare): make Cloudflare env/bindings available during `next dev`.
// No-op outside local development, so a normal `next build` is unaffected.
if (process.env.SELF_HOST_BUILD !== "1") {
  initOpenNextCloudflareForDev();
}
