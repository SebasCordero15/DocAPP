"use client";

import { useState } from "react";

const NAVY  = "#1B3A6B";
const GREEN = "#3CB54A";

export default function LoginClient() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d.role === "SUPER_ADMIN") {
          window.location.href = "/superadmin";
        } else if (d.forcePasswordChange) {
          window.location.href = "/dashboard/cambiar-contrasena";
        } else {
          window.location.href = "/dashboard";
        }
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Credenciales inválidas");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: `linear-gradient(145deg, ${NAVY} 0%, #0f2247 60%, #122e55 100%)`,
    }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .login-card { animation: fadeUp 0.4s ease-out; }
        .login-input { transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .login-input:focus { outline: none; border-color: ${GREEN} !important; box-shadow: 0 0 0 3px ${GREEN}28; }
        .login-btn { transition: opacity 0.15s ease, transform 0.15s ease; }
        .login-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
      `}</style>

      <div className="login-card" style={{ width: 400, padding: "0 16px" }}>

        {/* Card — white background so transparent logo looks perfect */}
        <div style={{
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 24px 64px rgba(0,0,0,0.40)",
          overflow: "hidden",
        }}>

          {/* ── Logo section — white so navy + green both pop ── */}
          <div style={{
            background: "#fff",
            padding: "32px 28px 20px",
            textAlign: "center",
            borderBottom: `3px solid ${GREEN}`,
          }}>
            <img
              src="/ke-control-logo.png"
              alt="KE-Control"
              style={{ width: 260, height: "auto", display: "block", margin: "0 auto" }}
            />
          </div>

          {/* ── Nav strip ── */}
          <div style={{
            background: NAVY,
            padding: "11px 28px",
          }}>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 500, textAlign: "center" }}>
              Inicia sesión en tu espacio de trabajo
            </p>
          </div>

          {/* ── Form ── */}
          <form onSubmit={submit} style={{ padding: "26px 28px 28px", background: "#fff" }}>
            <label style={ls}>Correo electrónico</label>
            <input
              className="login-input"
              style={is} type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com" required autoFocus
            />

            <label style={{ ...ls, marginTop: 16 }}>Contraseña</label>
            <input
              className="login-input"
              style={is} type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginTop: 14 }}>
                <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading} className="login-btn" style={btn}>
              {loading ? "Iniciando sesión…" : "Iniciar sesión"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", marginTop: 18, color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
          KE-Control · Gestión Documental Confiable
        </p>
      </div>
    </main>
  );
}

const ls: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6,
};
const is: React.CSSProperties = {
  width: "100%", padding: "10px 13px", border: "1px solid #d1d5db", borderRadius: 8,
  fontSize: 14, boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  width: "100%", marginTop: 22, padding: "13px",
  background: NAVY,
  color: "#fff", border: `2px solid ${GREEN}`,
  borderRadius: 9, fontWeight: 700, fontSize: 15, cursor: "pointer",
  letterSpacing: 0.3,
};
