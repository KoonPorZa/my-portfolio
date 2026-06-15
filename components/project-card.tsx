import type { Project } from "@/lib/data";
import { SocialIcon } from "@/components/ui/social-icon";

const ACCENT: Record<string, { text: string; border: string; glow: string }> = {
  cyan: { text: "text-cyan", border: "group-hover:border-cyan/60", glow: "group-hover:shadow-[var(--glow-cyan)]" },
  magenta: {
    text: "text-magenta",
    border: "group-hover:border-magenta/60",
    glow: "group-hover:shadow-[var(--glow-magenta)]",
  },
  lime: { text: "text-lime", border: "group-hover:border-lime/60", glow: "group-hover:shadow-[var(--glow-lime)]" },
};

export function ProjectCard({ project }: { project: Project }) {
  const a = ACCENT[project.accent];
  return (
    <article
      className={`group relative flex flex-col overflow-hidden border border-line bg-panel p-6 transition-all duration-300 hover:-translate-y-1.5 ${a.border} ${a.glow}`}
    >
      {/* top accent line */}
      <span
        className={`absolute inset-x-0 top-0 h-px scale-x-0 bg-current transition-transform duration-300 group-hover:scale-x-100 ${a.text}`}
      />

      <div className="flex items-center justify-between font-mono text-xs">
        <span className={a.text}>{project.id}</span>
        <span className="text-dim">{project.year}</span>
      </div>

      <h3 className="mt-4 font-display text-2xl font-bold text-hi">{project.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-fg">{project.description}</p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {project.tags.map((t) => (
          <span key={t} className="border border-line px-2 py-0.5 font-mono text-[11px] text-dim">
            {t}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-4 border-t border-line/70 pt-4 font-mono text-xs">
        {project.href && (
          <a
            href={project.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-dim transition-colors hover:text-hi"
          >
            <span className={a.text}>●</span> live <span aria-hidden>↗</span>
          </a>
        )}
        {project.repo && (
          <a
            href={project.repo}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-dim transition-colors hover:text-hi"
          >
            <SocialIcon name="github" className="h-3.5 w-3.5" />
            source
          </a>
        )}
      </div>
    </article>
  );
}
