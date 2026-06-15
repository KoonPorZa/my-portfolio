import { projects } from "@/lib/data";
import { ProjectCard } from "@/components/project-card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/about";

export function Projects() {
  return (
    <section id="work" className="relative mx-auto max-w-5xl scroll-mt-24 px-5 py-28">
      <Reveal>
        <SectionLabel index="02" title="selected work" />
      </Reveal>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {projects.map((p, i) => (
          <Reveal key={p.id} delay={0.06 * i}>
            <ProjectCard project={p} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
