import type { Metadata, Viewport } from "next";
import { Chakra_Petch, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { profile, stack } from "@/lib/data";
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
const url = `https://${profile.domain}`;

// Tech names from the stack power the keyword list (kept data-driven).
const keywords = [
  profile.name,
  profile.handle,
  profile.role,
  "Portfolio",
  ...stack.flatMap((g) => g.items),
];

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: title, template: `%s · ${profile.handle}` },
  description: profile.tagline,
  keywords,
  applicationName: profile.handle,
  authors: [{ name: profile.name, url }],
  creator: profile.name,
  publisher: profile.name,
  category: "technology",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    title,
    description: profile.tagline,
    url,
    siteName: profile.handle,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: profile.tagline,
    creator: profile.twitter,
  },
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
