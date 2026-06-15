// ─────────────────────────────────────────────────────────────
//  EDIT ME — all site content lives here. No need to touch the UI.
// ─────────────────────────────────────────────────────────────

export type Accent = "cyan" | "magenta" | "lime";

export const profile = {
  handle: "koonporza",
  domain: "koonporza.com",
  name: "Koonporza",
  role: "Developer & Creator",
  // shown in the hero terminal, typed out one phrase at a time
  typed: ["building cool stuff", "shipping side projects", "playing & making games"],
  location: "Bangkok, TH",
  status: "online" as "online" | "away" | "offline",
  bio: "Self-taught dev who lives between the editor and the game lobby. I build playful web things, automate the boring parts, and chase that one more commit before sleep.",
  email: "me@koonporza.com",
  resumeUrl: "/resume.pdf", // drop a resume.pdf in /public to enable
};

// Tech chips under the About section
export const stack: string[] = [
  "TypeScript",
  "Next.js",
  "React",
  "Tailwind",
  "Node.js",
  "Python",
  "PostgreSQL",
  "Figma",
];

// Animated skill bars (level 0–100)
export const skills: { label: string; level: number; accent: Accent }[] = [
  { label: "Frontend", level: 90, accent: "cyan" },
  { label: "Backend", level: 75, accent: "magenta" },
  { label: "UI / UX", level: 80, accent: "cyan" },
  { label: "Game dev", level: 60, accent: "lime" },
];

export type Project = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  href?: string; // live demo
  repo?: string; // source
  year: string;
  accent: Accent;
};

export const projects: Project[] = [
  {
    id: "01",
    title: "Neon Arcade",
    description:
      "A browser mini-game collection with online leaderboards and a CRT shader. Built for fun, kept for the dopamine.",
    tags: ["Next.js", "Canvas", "Supabase"],
    href: "#",
    repo: "#",
    year: "2026",
    accent: "cyan",
  },
  {
    id: "02",
    title: "Loot Tracker",
    description:
      "Real-time inventory + price tracker for in-game markets. Pulls APIs, charts trends, pings you on price drops.",
    tags: ["React", "WebSocket", "Recharts"],
    href: "#",
    repo: "#",
    year: "2025",
    accent: "magenta",
  },
  {
    id: "03",
    title: "devbot",
    description:
      "A Discord bot that runs my CI, posts deploy logs, and roasts failing builds. Surprisingly motivating.",
    tags: ["Node.js", "Discord.js", "Docker"],
    repo: "#",
    year: "2025",
    accent: "lime",
  },
  {
    id: "04",
    title: "koonporza.com",
    description:
      "This site. Cyberpunk portfolio + link-in-bio, hand-built with a neon dark design system.",
    tags: ["Next.js", "Tailwind", "Motion"],
    href: "#",
    repo: "#",
    year: "2026",
    accent: "cyan",
  },
];

export type LinkItem = {
  label: string;
  handle: string;
  href: string;
  icon: string; // key in components/ui/social-icon.tsx
  accent: Accent;
};

export const links: LinkItem[] = [
  { label: "GitHub", handle: "@koonporza", href: "https://github.com/", icon: "github", accent: "cyan" },
  { label: "X", handle: "@koonporza", href: "https://x.com/", icon: "x", accent: "magenta" },
  { label: "YouTube", handle: "Koonporza", href: "https://youtube.com/", icon: "youtube", accent: "magenta" },
  { label: "Instagram", handle: "@koonporza", href: "https://instagram.com/", icon: "instagram", accent: "cyan" },
  { label: "Discord", handle: "koonporza", href: "https://discord.com/", icon: "discord", accent: "lime" },
  { label: "Email", handle: "me@koonporza.com", href: "mailto:me@koonporza.com", icon: "mail", accent: "cyan" },
];

export const nav = [
  { label: "home", href: "#home" },
  { label: "about", href: "#about" },
  { label: "work", href: "#work" },
  { label: "links", href: "#links" },
];
