import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";

// Feature banner on the home page that leads to the live-GPS roadbook (/trip).
// Intentionally breaks the numbered-section rhythm to read as a "detour" / field log.
export function TripFeature() {
  return (
    <section id="trip" className="relative mx-auto max-w-5xl scroll-mt-24 px-5 py-20">
      <Reveal>
        <Link
          href="/trip"
          aria-label="เปิด Roadbook: ทริปสงขลา ถึง กรุงเทพฯ พร้อมแชร์ตำแหน่งสด"
          className="group relative block overflow-hidden border border-line bg-panel p-7 transition-all duration-300 hover:-translate-y-1.5 hover:border-lime/60 hover:shadow-[var(--glow-lime)] sm:p-9"
        >
          {/* top accent line, reveals on hover */}
          <span className="absolute inset-x-0 top-0 h-px scale-x-0 bg-lime transition-transform duration-300 group-hover:scale-x-100" />
          {/* atmospheric lime glow in the corner */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime/10 blur-3xl transition-colors duration-300 group-hover:bg-lime/20"
          />

          {/* eyebrow: field-log tag + live indicator */}
          <div className="relative flex items-center justify-between font-mono text-xs">
            <span className="text-dim">
              <span className="text-lime">{"//"}</span> field log
            </span>
            <span className="inline-flex items-center gap-2 text-lime">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-lime" />
              </span>
              LIVE GPS
            </span>
          </div>

          {/* title */}
          <h2 className="relative mt-5 font-display text-3xl font-bold leading-tight text-hi sm:text-4xl">
            สงขลา <span className="text-lime">→</span> กรุงเทพฯ
          </h2>
          <p className="relative mt-3 max-w-xl text-sm leading-relaxed text-fg">
            โร้ดบุ๊กการเดินทางด้วยมอเตอร์ไซค์ พร้อมแชร์ตำแหน่งสดแบบเรียลไทม์ — ติดตามเส้นทาง จุดพัก
            และพิกัดล่าสุดของผู้ขี่ได้จากลิงก์เดียว
          </p>

          {/* route strip: origin · distance · destination */}
          <div className="relative mt-7 flex items-center gap-3 font-mono text-[11px] text-dim">
            <span className="h-2 w-2 shrink-0 rounded-full border border-lime bg-void" />
            <span className="shrink-0 whitespace-nowrap text-fg">สงขลา</span>
            <span className="min-w-4 flex-1 border-t border-dashed border-line" />
            <span className="shrink-0 whitespace-nowrap text-lime">~1,014 กม.</span>
            <span className="min-w-4 flex-1 border-t border-dashed border-line" />
            <span className="shrink-0 whitespace-nowrap text-fg">กรุงเทพฯ</span>
            <span className="h-2 w-2 shrink-0 rounded-full bg-lime shadow-[var(--glow-lime)]" />
          </div>

          {/* CTA */}
          <div className="relative mt-8 inline-flex items-center gap-2 border border-lime/40 px-4 py-2 font-mono text-xs text-lime transition-colors duration-200 group-hover:bg-lime group-hover:text-void">
            เปิด Roadbook
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
              ↗
            </span>
          </div>
        </Link>
      </Reveal>
    </section>
  );
}
