export type ClassValue = string | number | false | null | undefined;

/**
 * Minimal className combiner for the vendored mapcn map component
 * (components/ui/map.tsx). mapcn only ever calls cn() with string/conditional
 * arguments, so a filter + join is enough — no need to pull in clsx or
 * tailwind-merge just for one file.
 */
export function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}
