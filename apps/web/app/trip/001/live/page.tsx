import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import { LiveViewer } from "./live-viewer";
import { PublicLiveViewer } from "./public-live-viewer";

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

const PAGE_TITLE = "Trip 01 · ตำแหน่งสด — สงขลา→กรุงเทพฯ";
const PAGE_DESCRIPTION =
  "ติดตามตำแหน่งสดระหว่างทริปสงขลา→กรุงเทพฯ แบบ realtime — เปิดแล้วหน้าจะอัปเดตเอง ไม่ต้องรีเฟรช";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    locale: "th_TH",
    type: "website",
  },
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
  const fontClassName = `${sans.variable} ${mono.variable}`;

  // With a viewer token → the private (owner-shared) viewer. Without one →
  // the public realtime viewer (anyone can watch while sharing is active).
  return token ? (
    <LiveViewer token={token} fontClassName={fontClassName} />
  ) : (
    <PublicLiveViewer fontClassName={fontClassName} />
  );
}

function normalizeToken(value: string | string[] | undefined): string {
  const token = Array.isArray(value) ? value[0] : value;

  return typeof token === "string" ? token.trim() : "";
}
