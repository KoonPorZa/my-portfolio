import { redirect } from "next/navigation";

// /trip is the trip index. With a single trip in the MVP it forwards to /trip/001;
// turn this into a real listing when more trips are added (folder-per-trip).
export default function TripIndex() {
  redirect("/trip/001");
}
