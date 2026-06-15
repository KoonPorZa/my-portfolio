import { links } from "@/lib/data";
import { SocialIcon } from "@/components/ui/social-icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/about";

const ACCENT: Record<string, string> = {
  cyan: "hover:border-cyan/60 hover:text-cyan hover:shadow-[var(--glow-cyan)]",
  magenta: "hover:border-magenta/60 hover:text-magenta hover:shadow-[var(--glow-magenta)]",
  lime: "hover:border-lime/60 hover:text-lime hover:shadow-[var(--glow-lime)]",
};

export function Links() {
  return (
    <section id="links" className="relative mx-auto max-w-5xl scroll-mt-24 px-5 py-28">
      <Reveal>
        <SectionLabel index="03" title="links" />
      </Reveal>

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {links.map((l, i) => (
          <Reveal key={l.label} delay={0.05 * i}>
            <a
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className={`group flex items-center gap-4 border border-line bg-panel p-4 text-fg transition-all duration-200 ${ACCENT[l.accent]}`}
            >
              <SocialIcon name={l.icon} className="h-6 w-6 shrink-0 transition-transform group-hover:scale-110" />
              <span className="min-w-0">
                <span className="block font-display text-sm font-semibold text-hi">{l.label}</span>
                <span className="block truncate font-mono text-xs text-dim">{l.handle}</span>
              </span>
              <span aria-hidden className="ml-auto font-mono text-dim transition-transform group-hover:translate-x-0.5">
                ↗
              </span>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
