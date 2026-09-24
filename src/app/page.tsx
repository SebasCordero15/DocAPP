"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

const NAVY  = "#1B3A6B";
const GREEN = "#3CB54A";

const FEATURES = [
  {
    titleKey: "feature1Title",
    descKey: "feature1Desc",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 21V9l9-6 9 6v12h-6v-7H9v7H3z" stroke={GREEN} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    titleKey: "feature2Title",
    descKey: "feature2Desc",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    titleKey: "feature3Title",
    descKey: "feature3Desc",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke={GREEN} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function Home() {
  const t = useTranslations("home");

  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: "48px 16px",
      background: `linear-gradient(145deg, ${NAVY} 0%, #0f2247 60%, #122e55 100%)`,
    }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .home-card { animation: fadeUp 0.5s ease-out; }
        .home-cta { transition: opacity 0.15s ease, transform 0.15s ease; }
        .home-cta:hover { opacity: 0.92; transform: translateY(-1px); }
        .home-feature { transition: transform 0.15s ease, background 0.15s ease; }
        .home-feature:hover { transform: translateY(-2px); background: rgba(255,255,255,0.06); }
      `}</style>

      <div className="home-card" style={{ width: "100%", maxWidth: 640 }}>

        {/* Card — logo on white so navy + green pop, like the login screen */}
        <div style={{
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 24px 64px rgba(0,0,0,0.40)",
          overflow: "hidden",
        }}>
          <div style={{
            background: "#fff",
            padding: "40px 40px 24px",
            textAlign: "center",
            borderBottom: `3px solid ${GREEN}`,
          }}>
            <img
              src="/ke-control-logo.png"
              alt="KE-Control"
              style={{ width: 220, height: "auto", display: "block", margin: "0 auto" }}
            />
          </div>

          <div style={{ background: NAVY, padding: "40px 40px 36px", textAlign: "center" }}>
            <p style={{
              margin: "0 0 10px", color: GREEN, fontSize: 12, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: 1.5,
            }}>
              {t("eyebrow")}
            </p>
            <h1 style={{ margin: "0 0 14px", color: "#fff", fontSize: 28, fontWeight: 800, lineHeight: 1.25 }}>
              {t("headline")}
            </h1>
            <p style={{ margin: "0 0 30px", color: "rgba(255,255,255,0.72)", fontSize: 15, lineHeight: 1.6 }}>
              {t("subtitle")}
            </p>

            <Link
              href="/login"
              className="home-cta"
              style={{
                display: "inline-block",
                padding: "14px 40px",
                background: GREEN,
                color: "#fff",
                borderRadius: 9,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: 0.3,
              }}
            >
              {t("cta")} →
            </Link>
          </div>

          <div style={{ background: "#fff", padding: "28px 32px 32px" }}>
            {FEATURES.map((f, i) => (
              <div
                key={f.titleKey}
                className="home-feature"
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  padding: "14px 12px",
                  borderRadius: 10,
                  borderTop: i === 0 ? "none" : "1px solid #f1f5f9",
                }}
              >
                <div style={{
                  flexShrink: 0,
                  width: 40, height: 40,
                  display: "grid", placeItems: "center",
                  background: "#f0fdf4",
                  borderRadius: 10,
                }}>
                  {f.icon}
                </div>
                <div>
                  <p style={{ margin: "0 0 3px", color: NAVY, fontSize: 14, fontWeight: 700 }}>
                    {t(f.titleKey)}
                  </p>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.55 }}>
                    {t(f.descKey)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: 18, color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
          {t("footer")}
        </p>
      </div>
    </main>
  );
}
