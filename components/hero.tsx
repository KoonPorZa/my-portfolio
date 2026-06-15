"use client";

import { useEffect, useState } from "react";
import { profile } from "@/lib/data";
import { GlowButton } from "@/components/ui/glow-button";

// Cycling typewriter: types a phrase, holds, deletes, moves to the next.
function useTyped(phrases: string[]) {
  const [text, setText] = useState("");
  const [i, setI] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const full = phrases[i % phrases.length];
    const done = text === full;
    const empty = text === "";

    let delay = deleting ? 45 : 90;
    if (done && !deleting) delay = 1600;
    if (empty && deleting) delay = 350;

    const t = setTimeout(() => {
      if (!deleting && done) setDeleting(true);
      else if (deleting && empty) {
        setDeleting(false);
        setI((v) => v + 1);
      } else {
        setText(full.slice(0, text.length + (deleting ? -1 : 1)));
      }
    }, delay);
    return () => clearTimeout(t);
  }, [text, deleting, i, phrases]);

  return text;
}

export function Hero() {
  const typed = useTyped(profile.typed);

  return (
    <section id="home" className="relative flex min-h-dvh flex-col justify-center px-5 pt-20">
      <div className="mx-auto w-full max-w-5xl">
        {/* status line */}
        <div className="rise mb-6 flex items-center gap-3 font-mono text-xs text-dim" style={{ animationDelay: "0ms" }}>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_var(--color-lime)]" />
            <span className="text-lime">{profile.status}</span>
          </span>
          <span className="text-line">//</span>
          <span>{profile.location}</span>
        </div>

        {/* glitch wordmark */}
        <h1
          className="rise glitch font-display text-[clamp(2.75rem,11vw,7.5rem)] font-bold uppercase leading-[0.92] tracking-tighter text-hi"
          data-text={profile.handle}
          style={{ animationDelay: "80ms" }}
        >
          {profile.handle}
        </h1>

        {/* terminal typing line */}
        <p className="rise mt-5 font-mono text-base text-fg sm:text-lg" style={{ animationDelay: "180ms" }}>
          <span className="text-cyan">{">"}</span> {typed}
          <span className="cursor ml-0.5 inline-block bg-cyan align-middle" />
        </p>

        <p className="rise mt-3 max-w-md font-mono text-sm text-dim" style={{ animationDelay: "240ms" }}>
          {profile.role}
        </p>

        {/* CTAs */}
        <div className="rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "320ms" }}>
          <GlowButton href="#work" variant="cyan">
            view work
            <span aria-hidden>→</span>
          </GlowButton>
          <GlowButton href="#links" variant="magenta">
            get in touch
          </GlowButton>
        </div>
      </div>

      {/* HUD corner brackets */}
      <span aria-hidden className="pointer-events-none absolute left-5 top-24 h-10 w-10 border-l border-t border-cyan/30" />
      <span aria-hidden className="pointer-events-none absolute bottom-10 right-5 h-10 w-10 border-b border-r border-magenta/30" />

      {/* scroll hint */}
      <a
        href="#about"
        className="absolute bottom-7 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-dim transition-colors hover:text-cyan"
      >
        scroll ↓
      </a>
    </section>
  );
}
