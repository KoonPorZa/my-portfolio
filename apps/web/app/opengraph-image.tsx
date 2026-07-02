import { ImageResponse } from "next/og";
import { profile } from "@/lib/data";

export const alt = `${profile.handle} — ${profile.role}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dynamic social-share card. Generated at build time. Satori-safe styles only.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          backgroundColor: "#07070b",
          backgroundImage:
            "radial-gradient(900px 900px at 8% -20%, rgba(47,243,255,0.18), transparent 55%), radial-gradient(800px 800px at 110% 120%, rgba(255,46,151,0.18), transparent 55%), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 100% 100%, 48px 48px, 48px 48px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "14px", height: "14px", borderRadius: "9999px", backgroundColor: "#b4f53c" }} />
          <div style={{ fontSize: "26px", color: "#6b7088", letterSpacing: "2px" }}>
            {profile.domain}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: "150px",
              fontWeight: 800,
              letterSpacing: "-6px",
              color: "#2ff3ff",
              lineHeight: 1,
            }}
          >
            {profile.handle}
          </div>
          <div style={{ display: "flex", marginTop: "18px", fontSize: "40px", color: "#f0f2ff" }}>
            {profile.role}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "28px", color: "#b7bcd4" }}>
          <span style={{ color: "#2ff3ff" }}>{">"}</span>
          <span>{profile.typed[0]}</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
