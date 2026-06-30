import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import { LiveViewer } from "./live-viewer";

const sans = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--trip-font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--trip-font-mono",
  display: "swap",
});

type TripLiveSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live GPS — Trip 01",
  description: "Read-only live location viewer for Trip 01 from Songkhla to Bangkok.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f3ecdd",
};

export default async function Trip01LivePage({
  searchParams,
}: {
  searchParams: TripLiveSearchParams;
}) {
  const { t } = await searchParams;
  const token = normalizeToken(t);

  return <LiveViewer token={token} fontClassName={`${sans.variable} ${mono.variable}`} />;
}

function normalizeToken(value: string | string[] | undefined): string {
  const token = Array.isArray(value) ? value[0] : value;

  return typeof token === "string" ? token.trim() : "";
}
