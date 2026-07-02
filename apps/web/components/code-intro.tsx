"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { profile, stack } from "@/lib/data";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/about";

// ── A self-introduction rendered as a live-typed TypeScript module. ──────
// Inspired by animate-ui's <Code writing /> component, rebuilt theme-native:
// own tokenizer + neon palette, driven entirely from lib/data.ts.

type Tok = { t: string; c?: string };

// token color helpers → map onto the site's neon palette
const kw = (t: string): Tok => ({ t, c: "text-magenta" });
const ty = (t: string): Tok => ({ t, c: "text-lime" });
const str = (t: string): Tok => ({ t, c: "text-cyan" });
const fn = (t: string): Tok => ({ t, c: "text-cyan" });
const prop = (t: string): Tok => ({ t, c: "text-hi" });
const pun = (t: string): Tok => ({ t, c: "text-dim" });
const txt = (t: string): Tok => ({ t, c: "text-fg" });
const com = (t: string): Tok => ({ t, c: "text-dim italic" });
const sp = (n: number): Tok => ({ t: " ".repeat(n) }); // indentation, uncolored

// Build the source as an array of lines (each line = Tok[]) from real data.
function buildSource(): Tok[][] {
  const q = (s: string) => `"${s}"`;
  const L: Tok[][] = [];
  const line = (...t: Tok[]) => L.push(t);

  line(com("// koonporza.dev.ts — whoami(), compiled live"));
  line();
  line(kw("import"), txt(" { "), ty("Developer"), txt(" } "), kw("from"), txt(" "), str(q("@koonporza/core")), pun(";"));
  line();
  line(kw("export"), txt(" "), kw("const"), txt(" "), prop("koonporza"), pun(": "), ty("Developer"), txt(" "), pun("= {"));
  line(sp(2), prop("name"), pun(": "), str(q(profile.name)), pun(","));
  line(sp(2), prop("role"), pun(": "), str(q(profile.role)), pun(","));
  line(sp(2), prop("based"), pun(": "), str(q(profile.location)), pun(","));
  line(sp(2), prop("status"), pun(": "), str(q(profile.status)), pun(","));
  line(sp(2), prop("focus"), pun(": ["));
  profile.typed.forEach((p) => line(sp(4), str(q(p)), pun(",")));
  line(sp(2), pun("],"));
  line(sp(2), prop("stack"), pun(": {"));
  stack.forEach((g) => {
    const key = g.group.toLowerCase().split(/[\s&]+/)[0]; // "Data & Cache" → "data"
    line(sp(4), prop(key), pun(": ["), str(g.items.map(q).join(", ")), pun("],"));
  });
  line(sp(2), pun("},"));
  line(sp(2), prop("available"), pun(": "), ty("true"), pun(","));
  line(pun("};"));
  line();
  line(com("// ready when you are →"));
  line(kw("async"), txt(" "), kw("function"), txt(" "), fn("hire"), pun("("), txt("dev"), pun(": "), ty("Developer"), pun(") {"));
  line(sp(2), kw("return"), txt(" dev"), pun("."), txt("available"), txt(" "), pun("? "), fn("ship"), pun("(dev) : "), fn("ping"), pun("("), str(q(profile.email)), pun(");"));
  line(pun("}"));
  return L;
}

const TARGET_MS = 4200; // total time to "type" the whole module
const TICK_MS = 16;

export function CodeIntro() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [count, setCount] = useState(0);

  // Precompute lines + per-line char offsets so typing can reveal by index.
  const { lines, lineStart, lineLen, total } = useMemo(() => {
    const lines = buildSource();
    const lineStart: number[] = [];
    const lineLen: number[] = [];
    let offset = 0;
    lines.forEach((ln, i) => {
      lineStart[i] = offset;
      const len = ln.reduce((n, tk) => n + tk.t.length, 0);
      lineLen[i] = len;
      offset += len + 1; // +1 for the line break
    });
    return { lines, lineStart, lineLen, total: offset };
  }, []);

  const step = Math.max(1, Math.ceil(total / (TARGET_MS / TICK_MS)));

  // Start typing only once the pane scrolls into view (animate-ui `inView`).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The typing loop. Reduced-motion users skip it and see the full module.
  useEffect(() => {
    if (reduce || !started || count >= total) return;
    const id = setTimeout(() => setCount((c) => Math.min(total, c + step)), TICK_MS);
    return () => clearTimeout(id);
  }, [reduce, started, count, total, step]);

  const shown = reduce ? total : count;
  const done = shown >= total;
  // Which line currently holds the caret: last line whose start ≤ shown.
  let caretLine = 0;
  for (let i = 0; i < lines.length; i++) if (lineStart[i] <= shown) caretLine = i;
  if (done) caretLine = lines.length - 1;

  const pct = Math.round((Math.min(shown, total) / total) * 100);

  return (
    <section
      id="whoami"
      className="relative mx-auto max-w-5xl scroll-mt-24 px-5 pb-4 pt-24"
    >
      <Reveal>
        <SectionLabel index="00" title="whoami" />
      </Reveal>

      <Reveal delay={0.05}>
        <div
          ref={ref}
          className="group mt-10 overflow-hidden rounded-lg border border-line bg-panel shadow-[0_0_0_1px_rgba(47,243,255,0.04),0_30px_80px_-40px_rgba(0,0,0,0.9)]"
        >
          {/* top accent line that lights up while compiling */}
          <div
            className="h-px w-full bg-gradient-to-r from-cyan via-magenta to-lime transition-opacity duration-500"
            style={{ opacity: done ? 0.35 : 0.8 }}
          />

          {/* editor chrome */}
          <div className="flex items-center gap-2 border-b border-line bg-elevated/60 px-4 py-2.5">
            <span className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-magenta/80 shadow-[0_0_6px_var(--color-magenta)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-lime/80 shadow-[0_0_6px_var(--color-lime)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-cyan/80 shadow-[0_0_6px_var(--color-cyan)]" />
            </span>
            <span className="ml-2 font-mono text-xs text-dim">
              <span className="text-fg">{profile.handle}</span>.dev.ts
            </span>
            <span className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${done ? "bg-lime shadow-[0_0_6px_var(--color-lime)]" : "bg-cyan shadow-[0_0_6px_var(--color-cyan)] animate-pulse"}`}
              />
              <span className={done ? "text-lime" : "text-cyan"}>
                {done ? "compiled" : "typing"}
              </span>
            </span>
          </div>

          {/* code body */}
          <div className="overflow-x-auto px-1 py-4 font-mono text-[13px] leading-relaxed sm:text-sm">
            {lines.map((ln, li) => {
              const visible = Math.max(0, Math.min(shown - lineStart[li], lineLen[li]));
              let acc = 0; // chars consumed within this line
              return (
                <div
                  key={li}
                  className="flex min-h-[1.5em] whitespace-pre px-3 transition-colors hover:bg-elevated/40"
                >
                  <span className="mr-4 inline-block w-6 shrink-0 select-none text-right text-dim/40">
                    {li + 1}
                  </span>
                  <span className="flex-1">
                    {ln.map((tk, ti) => {
                      const shown = Math.max(0, Math.min(visible - acc, tk.t.length));
                      acc += tk.t.length;
                      if (shown <= 0) return null;
                      return (
                        <span key={ti} className={tk.c}>
                          {tk.t.slice(0, shown)}
                        </span>
                      );
                    })}
                    {(caretLine === li || (done && li === lines.length - 1)) && (
                      <span className="cursor ml-px inline-block bg-cyan align-middle shadow-[0_0_8px_var(--color-cyan)]" />
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* status bar / terminal output */}
          <div className="flex items-center gap-3 border-t border-line bg-elevated/60 px-4 py-2 font-mono text-[11px]">
            {done ? (
              <span className="text-lime">
                ✓ ready — <span className="text-fg">{lines.length} lines</span>, available for hire
              </span>
            ) : (
              <span className="text-cyan">▶ executing whoami()…</span>
            )}
            <span className="ml-auto text-dim">{pct}%</span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
