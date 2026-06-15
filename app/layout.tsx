import type { Metadata, Viewport } from "next";
import { Chakra_Petch, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { profile } from "@/lib/data";
import { Grain } from "@/components/ui/grain";
import { Nav } from "@/components/nav";

const display = Chakra_Petch({
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jbmono",
  display: "swap",
});

const title = `${profile.handle} — ${profile.role}`;

export const metadata: Metadata = {
  metadataBase: new URL(`https://${profile.domain}`),
  title: { default: title, template: `%s · ${profile.handle}` },
  description: profile.bio,
  openGraph: {
    title,
    description: profile.bio,
    url: `https://${profile.domain}`,
    siteName: profile.handle,
    type: "website",
  },
  twitter: { card: "summary_large_image", title, description: profile.bio },
};

export const viewport: Viewport = {
  themeColor: "#07070b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <Grain />
        <Nav />
        {children}
      </body>
    </html>
  );
}
