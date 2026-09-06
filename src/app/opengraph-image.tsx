import { ImageResponse } from "next/og";

export const alt = "Test de vitesse Internet en Tunisie – débit et ping gratuits";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="#f97316" />
          </svg>
          <span style={{ fontSize: 36, fontWeight: 600, color: "#a1a1aa" }}>vitesse&nbsp;test</span>
        </div>
        <div style={{ fontSize: 62, fontWeight: 900, marginTop: 24, textAlign: "center" }}>
          Test de Vitesse Internet
        </div>
        <div style={{ fontSize: 92, fontWeight: 900, color: "#f97316", marginTop: 8, textAlign: "center" }}>
          Tunisie
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            marginTop: 28,
            textAlign: "center",
          }}
        >
          Débit, téléchargement, envoi &amp; ping en quelques secondes
        </div>
      </div>
    ),
    size
  );
}