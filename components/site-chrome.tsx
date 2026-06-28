"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/nav";
import { Grain } from "@/components/ui/grain";

export function SiteChrome() {
  const pathname = usePathname();

  if (pathname.startsWith("/trip-01")) {
    return null;
  }

  return (
    <>
      <Grain />
      <Nav />
    </>
  );
}
