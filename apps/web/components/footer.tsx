import { profile } from "@/lib/data";

export function Footer() {
  return (
    <footer className="relative mx-auto max-w-5xl px-5 pb-12 pt-10">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan/40 to-transparent shadow-[0_0_12px_var(--color-cyan)]" />
      <div className="mt-8 flex flex-col items-start justify-between gap-4 font-mono text-xs text-dim sm:flex-row sm:items-center">
        <p>
          <span className="text-cyan">$</span> © {profile.domain}
        </p>
        <p className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_var(--color-lime)]" />
          built with Next.js · Tailwind · Motion
        </p>
      </div>
    </footer>
  );
}
