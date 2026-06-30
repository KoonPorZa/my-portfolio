export function tripGpsApiBase(): string {
  return (process.env.NEXT_PUBLIC_TRIP_GPS_API_BASE ?? "")
    .trim()
    .replace(/\/+$/, "");
}
