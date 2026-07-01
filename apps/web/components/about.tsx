import type { ReactNode } from "react";
import { profile, skills } from "@/lib/data";
import { Reveal } from "@/components/ui/reveal";
import { GlowButton } from "@/components/ui/glow-button";
import { TechMarquee } from "@/components/tech-marquee";

// focus-area chips reuse the skill accents — labels only, no more 0–100 bars.
const CHIP: Record<string, string> = {
  cyan: "border-cyan/40 text-cyan hover:bg-cyan/10",
  magenta: "border-magenta/40 text-magenta hover:bg-magenta/10",
  lime: "border-lime/40 text-lime hover:bg-lime/10",
};

export function About() {
  return (
    <section id="about" className="relative mx-auto max-w-5xl scroll-mt-24 px-5 py-28">
      <Reveal>
        <SectionLabel index="01" title="about" />
      </Reveal>

      <div className="mt-10 grid gap-12 md:grid-cols-[1.1fr_0.9fr] md:gap-14">
        {/* narrative */}
        <Reveal delay={0.05}>
          <div>
            <p className="mb-4 font-mono text-xs text-dim">
              <span className="text-cyan">{">"}</span> whoami
            </p>
            <p className="font-display text-xl leading-relaxed text-hi sm:text-2xl">{profile.bio}</p>

            {profile.resumeUrl && (
              <div className="mt-8">
                <GlowButton href={profile.resumeUrl} variant="ghost" external>
                  download resume
                  <span aria-hidden>↓</span>
                </GlowButton>
              </div>
            )}
          </div>
        </Reveal>

        {/* system readout */}
        <Reveal delay={0.12}>
          <div className="relative border border-line bg-panel/60 backdrop-blur-sm">
            {/* HUD corner brackets */}
            <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-4 w-4 border-l-2 border-t-2 border-cyan" />
            <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-magenta" />

            {/* window title bar */}
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-magenta/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-lime/80" />
              <span className="ml-2 font-mono text-[11px] tracking-wide text-dim">koonporza.sys</span>
            </div>

            {/* key / value spec */}
            <dl className="divide-y divide-line/70 px-4 font-mono text-sm">
              <Row k="role" v={profile.role} />
              <Row k="based" v={profile.location} />
              <Row k="status">
                <span className="inline-flex items-center gap-2 text-lime">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_var(--color-lime)]" />
                  {profile.status}
                </span>
              </Row>
              <Row k="focus" v="APIs · Data · Infra" />
            </dl>

            {/* focus areas — the old skills, without the percentages */}
            <div className="border-t border-line px-4 py-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
                <span className="text-cyan">{"//"}</span> focus areas
              </p>
              <ul className="flex flex-wrap gap-2">
                {skills.map((sk) => (
                  <li
                    key={sk.label}
                    className={`border px-2.5 py-1 font-mono text-xs transition-colors ${CHIP[sk.accent]}`}
                  >
                    {sk.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.05}>
        <p className="mt-16 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
          <span className="text-cyan">{"//"}</span> stack
        </p>
        <TechMarquee />
      </Reveal>
    </section>
  );
}

function Row({ k, v, children }: { k: string; v?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-dim">
        <span className="text-cyan/60">{"//"}</span> {k}
      </dt>
      <dd className="text-right text-hi">{children ?? v}</dd>
    </div>
  );
}

export function SectionLabel({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="font-mono text-xs text-cyan">{index}</span>
      <h2 className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-dim">
        <span className="text-cyan">{"//"}</span> {title}
      </h2>
      <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
    </div>
  );
}
