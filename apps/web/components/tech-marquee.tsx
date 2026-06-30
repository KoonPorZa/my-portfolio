"use client";

import { useMemo, type CSSProperties } from "react";
import { LogoLoop, type LogoItem } from "@/components/ui/logo-loop";
import { TechIcon, hasTechIcon, techColor } from "@/components/ui/tech-icon";
import { stack } from "@/lib/data";

const VOID = "#07070b"; // matches --color-void for seamless edge fade

// One pill: icon + label, monochrome by default, lights up to the brand
// color (with a matching glow) on hover.
function chip(name: string): LogoItem {
  return {
    title: name,
    ariaLabel: name,
    node: (
      <span
        className="group/tech flex items-center gap-2.5 rounded-md border border-line/70 bg-panel/50 px-4 py-2.5 backdrop-blur-sm transition-colors duration-300 hover:border-[var(--c)]"
        style={{ "--c": techColor(name) } as CSSProperties}
      >
        <TechIcon
          name={name}
          className="text-[1.5em] text-dim transition-all duration-300 group-hover/tech:text-[var(--c)] group-hover/tech:[filter:drop-shadow(0_0_8px_var(--c))]"
        />
        <span className="whitespace-nowrap font-mono text-sm text-fg/75 transition-colors duration-300 group-hover/tech:text-hi">
          {name}
        </span>
      </span>
    ),
  };
}

export function TechMarquee() {
  // Flatten the grouped stack into one ordered, de-duplicated list of items
  // that actually have an icon.
  const names = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const group of stack) {
      for (const item of group.items) {
        if (hasTechIcon(item) && !seen.has(item)) {
          seen.add(item);
          out.push(item);
        }
      }
    }
    return out;
  }, []);

  const half = Math.ceil(names.length / 2);
  const rowA = useMemo(() => names.slice(0, half).map(chip), [names, half]);
  const rowB = useMemo(() => names.slice(half).map(chip), [names, half]);

  return (
    <div className="relative mt-14 space-y-4">
      <LogoLoop
        logos={rowA}
        direction="left"
        speed={40}
        gap={16}
        logoHeight={22}
        pauseOnHover
        scaleOnHover
        fadeOut
        fadeOutColor={VOID}
        ariaLabel="Tech stack — row one"
      />
      <LogoLoop
        logos={rowB}
        direction="right"
        speed={40}
        gap={16}
        logoHeight={22}
        pauseOnHover
        scaleOnHover
        fadeOut
        fadeOutColor={VOID}
        ariaLabel="Tech stack — row two"
      />
    </div>
  );
}
