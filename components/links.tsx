import { links } from "@/lib/data";
import { getSocialStats } from "@/lib/social";
import { SocialIcon } from "@/components/ui/social-icon";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/about";

const ACCENT: Record<string, string> = {
  cyan: "hover:border-cyan/60 hover:text-cyan hover:shadow-[var(--glow-cyan)]",
  magenta: "hover:border-magenta/60 hover:text-magenta hover:shadow-[var(--glow-magenta)]",
  lime: "hover:border-lime/60 hover:text-lime hover:shadow-[var(--glow-lime)]",
};

export async function Links() {
  const stats = await getSocialStats();

  return (
    <section id="links" className="relative mx-auto max-w-5xl scroll-mt-24 px-5 py-28">
      <Reveal>
        <SectionLabel index="03" title="links" />
      </Reveal>

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {links.map((l, i) => {
          const s = stats[l.icon];
          const statLine = s?.stat ?? l.manual;
          return (
            <Reveal key={l.label} delay={0.05 * i}>
              <a
                href={l.href}
                target={l.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className={`group flex items-center gap-4 border border-line bg-panel p-4 text-fg transition-all duration-200 ${ACCENT[l.accent]}`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-void transition-transform group-hover:scale-105">
                  {s?.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.avatar} alt={l.label} width={44} height={44} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <SocialIcon name={l.icon} className="h-5 w-5" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-display text-sm font-semibold text-hi">{l.label}</span>
                  <span className="block truncate font-mono text-xs text-dim">{l.handle}</span>
                  {statLine ? (
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-dim/90">{statLine}</span>
                  ) : null}
                </span>

                <span aria-hidden className="font-mono text-dim transition-transform group-hover:translate-x-0.5">
                  ↗
                </span>
              </a>
            </Reveal>
          );
        })}
      </div>

      <p className="mt-6 font-mono text-[11px] text-dim">
        <span className="text-cyan">//</span> GitHub is live. YouTube/Discord activate when you add API keys in{" "}
        <span className="text-fg">.env</span>
      </p>
    </section>
  );
}
