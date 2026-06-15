// ─────────────────────────────────────────────────────────────
//  EDIT ME — all site content lives here. No need to touch the UI.
// ─────────────────────────────────────────────────────────────

export type Accent = "cyan" | "magenta" | "lime";

export const profile = {
  handle: "koonporza",
  domain: "koonporza.com",
  name: "Koonporza",
  role: "Backend Developer",
  // shown in the hero terminal, typed out one phrase at a time
  typed: [
    "designing APIs that scale",
    "modeling data across SQL & NoSQL",
    "keeping things fast with Redis",
    "backend-heavy, full-stack when needed",
  ],
  location: "Bangkok, TH",
  status: "online" as "online" | "away" | "offline",
  bio: "Backend-leaning developer from Bangkok. I live in the server layer — designing clean APIs with NestJS, modeling data across SQL and NoSQL, and keeping things fast with Redis and solid infra. Comfortable across the whole stack with React/Next when a project needs it end to end.",
  email: "Patipol.Pantarat@gmail.com",
  resumeUrl: "", // drop a resume.pdf in /public and set "/resume.pdf" to show the button
};

// Tech chips under the About section, grouped by area (backend-first).
export const stack: { group: string; items: string[] }[] = [
  { group: "Backend", items: ["NestJS", "Node.js", "TypeScript", "REST APIs"] },
  { group: "Data & Cache", items: ["PostgreSQL", "MySQL", "Redis", "Supabase", "Firebase"] },
  { group: "Frontend", items: ["React", "Next.js", "Tailwind", "shadcn/ui", "MUI", "Redux"] },
  { group: "DevOps & Infra", items: ["Docker", "GitHub", "GitLab", "Vercel", "Cloudflare R2", "Claude Code"] },
];

// Animated skill bars (level 0–100)
export const skills: { label: string; level: number; accent: Accent }[] = [
  { label: "Backend & APIs", level: 90, accent: "cyan" },
  { label: "Databases & Caching", level: 88, accent: "magenta" },
  { label: "DevOps & Infra", level: 78, accent: "lime" },
  { label: "Frontend", level: 72, accent: "cyan" },
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
    title: "Commerce API",
    description:
      "Modular NestJS backend for an online store — catalog, cart, orders and payments. PostgreSQL with Prisma, Redis caching, and background queue workers for the heavy lifting.",
    tags: ["NestJS", "PostgreSQL", "Redis"],
    href: "#",
    repo: "#",
    year: "2026",
    accent: "cyan",
  },
  {
    id: "02",
    title: "Realtime Sync Service",
    description:
      "WebSocket gateway with Redis pub/sub powering live updates, presence and push notifications across web and mobile clients.",
    tags: ["NestJS", "WebSocket", "Redis"],
    href: "#",
    repo: "#",
    year: "2025",
    accent: "magenta",
  },
  {
    id: "03",
    title: "Media Pipeline",
    description:
      "Upload + transform service backed by Cloudflare R2 — signed URLs, async processing, and a thin API that keeps storage costs low.",
    tags: ["Node.js", "Cloudflare R2", "Docker"],
    repo: "#",
    year: "2025",
    accent: "lime",
  },
  {
    id: "04",
    title: "koonporza.com",
    description:
      "This site. Neon-dark portfolio + link-in-bio, hand-built on Next.js with live social stats fetched server-side.",
    tags: ["Next.js", "Tailwind", "Vercel"],
    href: "https://koonporza.com",
    repo: "https://github.com/KoonPorZa/portfolio-koonporza",
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
  // Live profile fetch (server-side, see lib/social.ts). Omit for static tiles.
  live?: "github" | "youtube" | "discord";
  ref?: string; // github username | youtube @handle/UC… id | discord server id
  manual?: string; // static stat line for platforms with no live API (e.g. "12.4K followers")
};

export const links: LinkItem[] = [
  // GitHub: LIVE (real account, no API key) → pulls avatar + repos + followers.
  { label: "GitHub", handle: "@KoonPorZa", href: "https://github.com/KoonPorZa", icon: "github", accent: "cyan", live: "github", ref: "KoonPorZa" },
  // X: no practical public API → set `manual` if you want a stat line. href is a mock guess.
  { label: "X", handle: "@koon_por_za", href: "https://x.com/koon_por_za", icon: "x", accent: "magenta" },
  // YouTube: LIVE once you set YOUTUBE_API_KEY in .env and the real channel in `ref` (@handle or UC… id).
  { label: "YouTube", handle: "@koonporza", href: "https://youtube.com/@koonporza", icon: "youtube", accent: "magenta", live: "youtube", ref: "@koonporza" },
  // Instagram: real account. No public API → use `manual` for a follower count if you like.
  { label: "Instagram", handle: "@koon_por_za", href: "https://www.instagram.com/koon_por_za/", icon: "instagram", accent: "cyan" },
  // Discord: set `ref` to your server id + enable the server Widget to show online count.
  { label: "Discord", handle: "koon_por_za", href: "https://discord.com/", icon: "discord", accent: "lime", live: "discord", ref: "" },
  { label: "Email", handle: "Patipol.Pantarat@gmail.com", href: "mailto:Patipol.Pantarat@gmail.com", icon: "mail", accent: "cyan" },
];

export const nav = [
  { label: "home", href: "#home" },
  { label: "about", href: "#about" },
  { label: "work", href: "#work" },
  { label: "links", href: "#links" },
];
