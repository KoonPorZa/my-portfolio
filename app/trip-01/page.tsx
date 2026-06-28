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

export const metadata: Metadata = {
  title: "Trip 01 — R15v3 Roadbook",
  description:
    "Private R15v3 roadbook from Songkhla to Bangkok with PTT stops, budget, and mobile-first checklist.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f3ecdd",
};

export default function Trip01Page() {
  return <Trip01Client fontClassName={`${sans.variable} ${mono.variable}`} />;
}
