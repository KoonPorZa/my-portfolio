import type { ReactNode } from "react";

type Variant = "cyan" | "magenta" | "ghost";

const VARIANTS: Record<Variant, string> = {
  cyan: "border-cyan/60 text-cyan hover:bg-cyan hover:text-void hover:shadow-[var(--glow-cyan)] hover:border-cyan",
  magenta:
    "border-magenta/60 text-magenta hover:bg-magenta hover:text-void hover:shadow-[var(--glow-magenta)] hover:border-magenta",
  ghost: "border-line text-fg hover:border-cyan/60 hover:text-cyan",
};

type GlowButtonProps = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  external?: boolean;
  className?: string;
};

export function GlowButton({
  href,
  children,
  variant = "cyan",
  external,
  className = "",
}: GlowButtonProps) {
  const ext = external ? { target: "_blank", rel: "noreferrer" } : {};
  return (
    <a
      href={href}
      {...ext}
      className={`group inline-flex items-center gap-2 border px-5 py-2.5 font-mono text-sm uppercase tracking-wider transition-all duration-200 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </a>
  );
}
