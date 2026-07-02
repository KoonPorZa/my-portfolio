// Server-only social profile fetchers. Each returns null on any failure so a
// dead API never breaks a card — the tile falls back to its static icon/handle.
// Results are cached with ISR (revalidate), so we don't hammer the APIs.

import { links } from "@/lib/data";

const REVALIDATE = 60 * 60 * 6; // 6h

export type SocialStat = { avatar?: string; name?: string; stat?: string };

function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

// GitHub — public, no key needed (optional GITHUB_TOKEN raises the rate limit).
async function getGitHub(user: string): Promise<SocialStat | null> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "koonporza.com",
      Accept: "application/vnd.github+json",
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}`, {
      headers,
      next: { revalidate: REVALIDATE },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return {
      avatar: j.avatar_url,
      name: j.name ?? j.login,
      stat: `${compact(j.public_repos)} repos · ${compact(j.followers)} followers`,
    };
  } catch {
    return null;
  }
}

// YouTube — needs YOUTUBE_API_KEY (free, Google Cloud) + a channel handle or UC… id.
async function getYouTube(ref: string): Promise<SocialStat | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !ref) return null;
  try {
    const param = ref.startsWith("UC")
      ? `id=${ref}`
      : `forHandle=${encodeURIComponent(ref.replace(/^@/, ""))}`;
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&${param}&key=${key}`,
      { next: { revalidate: REVALIDATE } }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const c = j.items?.[0];
    if (!c) return null;
    return {
      avatar: c.snippet?.thumbnails?.default?.url,
      name: c.snippet?.title,
      stat: `${compact(+c.statistics.subscriberCount)} subs · ${compact(+c.statistics.videoCount)} videos`,
    };
  } catch {
    return null;
  }
}

// Discord — server widget only (must be enabled in Server Settings → Widget).
// No personal-profile API exists; this shows the server's online count.
async function getDiscord(serverId: string): Promise<SocialStat | null> {
  if (!serverId) return null;
  try {
    const r = await fetch(`https://discord.com/api/guilds/${serverId}/widget.json`, {
      next: { revalidate: 60 * 30 },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { name: j.name, stat: `${compact(j.presence_count ?? 0)} online` };
  } catch {
    return null;
  }
}

// Fetches every live link in parallel; returns a map keyed by link.icon.
export async function getSocialStats(): Promise<Record<string, SocialStat>> {
  const out: Record<string, SocialStat> = {};
  await Promise.all(
    links.map(async (l) => {
      let s: SocialStat | null = null;
      if (l.live === "github" && l.ref) s = await getGitHub(l.ref);
      else if (l.live === "youtube" && l.ref) s = await getYouTube(l.ref);
      else if (l.live === "discord" && l.ref) s = await getDiscord(l.ref);
      if (s) out[l.icon] = s;
    })
  );
  return out;
}
