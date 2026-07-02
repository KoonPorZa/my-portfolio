import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Branded favicon: neon "K" on void.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#07070b",
          color: "#2ff3ff",
          fontSize: "46px",
          fontWeight: 800,
          fontFamily: "sans-serif",
          borderRadius: "14px",
        }}
      >
        K
      </div>
    ),
    { ...size }
  );
}
