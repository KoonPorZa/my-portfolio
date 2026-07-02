"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { nav as navItems, profile } from "@/lib/data";

export function Nav() {
  const pathname = usePathname();
  const [active, setActive] = useState("home");
  const [scrolled, setScrolled] = useState(false);
  const hideNav = pathname.startsWith("/trip/");

  useEffect(() => {
    if (hideNav) return;

    const ids = navItems.map((n) => n.href.slice(1));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach((s) => io.observe(s));

    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [hideNav]);

  if (hideNav) return null;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-line/80 bg-void/80 backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <a href="#home" className="group flex items-center gap-2.5 font-display text-sm font-bold tracking-tight">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-lime shadow-[0_0_8px_var(--color-lime)]" />
          </span>
          <span className="text-hi">
            {profile.handle}
            <span className="text-cyan">.com</span>
          </span>
        </a>

        <ul className="flex items-center gap-1 font-mono text-xs">
          {navItems.map((n) => {
            const id = n.href.slice(1);
            const on = active === id;
            return (
              <li key={n.href}>
                <a
                  href={n.href}
                  className={`relative px-2.5 py-1.5 uppercase tracking-wider transition-colors ${
                    on ? "text-cyan" : "text-dim hover:text-hi"
                  }`}
                >
                  <span className={`mr-0.5 ${on ? "text-cyan" : "text-line"}`}>/</span>
                  {n.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
