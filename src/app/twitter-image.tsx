import { ImageResponse } from "next/og";

export const alt = "Speed Test Tunisie – test de vitesse internet gratuit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a0b 0%, #1c1408 55%, #2b1a05 100%)",
          fontFamily: "sans-serif",
          color: "#fafafa",
          padding: 48,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="#f97316" />
          </svg>
          <span style={{ fontSize: 32, fontWeight: 600, color: "#a1a1aa" }}>vitesse&nbsp;test</span>
        </div>
        <div style={{ fontSize: 64, fontWeight: 900, marginTop: 20, textAlign: "center" }}>
          Speed Test Tunisie
        </div>
        <div style={{ fontSize: 32, color: "#a1a1aa", marginTop: 24, textAlign: "center" }}>
          Fibre · ADSL · 4G · 4G+ · 5G · WiFi
        </div>
      </div>
    ),
    size
  );
}