import type { CSSProperties } from "react";
import { profile, skills } from "@/lib/data";
import { Reveal } from "@/components/ui/reveal";
import { GlowButton } from "@/components/ui/glow-button";
import { TechMarquee } from "@/components/tech-marquee";

const BAR: Record<string, string> = {
  cyan: "bg-cyan shadow-[0_0_10px_var(--color-cyan)]",
  magenta: "bg-magenta shadow-[0_0_10px_var(--color-magenta)]",
  lime: "bg-lime shadow-[0_0_10px_var(--color-lime)]",
};

export function About() {
  return (
    <section id="about" className="relative mx-auto max-w-5xl scroll-mt-24 px-5 py-28">
      <Reveal>
        <SectionLabel index="01" title="about" />
      </Reveal>

      <div className="mt-10 grid gap-12 md:grid-cols-2 md:gap-16">
        <Reveal delay={0.05}>
          <div>
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

        <Reveal delay={0.12}>
          <div className="space-y-6">
            {skills.map((sk) => (
              <div key={sk.label}>
                <div className="mb-2 flex items-baseline justify-between font-mono text-xs">
                  <span className="uppercase tracking-wider text-fg">{sk.label}</span>
                  <span className="text-dim">{sk.level}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden border border-line bg-void">
                  <div
                    className={`skillbar h-full ${BAR[sk.accent]}`}
                    style={{ "--lvl": `${sk.level}%` } as CSSProperties}
                  />
                </div>
              </div>
            ))}
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
