import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import { Trip01Client } from "./trip-client";

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

const PAGE_TITLE = "Trip 01 · สงขลา→กรุงเทพฯ — แผนเดินทาง";
const PAGE_DESCRIPTION =
  "แผนทริปมอเตอร์ไซค์ 2 วัน สงขลา→กรุงเทพฯ: ออกเที่ยงวันที่ 12 นอนหลังสวน เข้ากรุงเทพฯ บ่ายวันที่ 13 — จุดพัก PTT 10 จุด เวลาถึงโดยประมาณ และพยากรณ์อากาศตามเวลาถึงแต่ละจุด";

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

export default function Trip01Page() {
  return <Trip01Client fontClassName={`${sans.variable} ${mono.variable}`} />;
}
