"use client";

import { useState } from "react";

export default function LoginClient() {
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlug: slug || undefined, email, password }),
      });
      if (res.ok) {
        // Hard navigation — bypasses the Next.js Router Cache; prevents session
        // cross-contamination when accounts switch in the same browser.
        window.location.href = "/dashboard";
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Invalid credentials");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9" }}>
      <div style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#1e293b", margin: 0 }}>DocVault</h1>
          <p style={{ color: "#64748b", margin: "6px 0 0", fontSize: 14 }}>Sign in to your workspace</p>
        </div>

        <div style={{ background: "#fff", padding: "28px 32px", borderRadius: 14, boxShadow: "0 4px 24px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0" }}>
          <form onSubmit={submit}>
            <label style={ls}>Email</label>
            <input
              style={is} type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" required autoFocus
            />

            <label style={ls}>Password</label>
            <input
              style={is} type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <label style={{ ...ls, marginTop: 20 }}>Company <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: 12 }}>(optional)</span></label>
            <input
              style={is} value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="your-company-slug"
            />

            {error && <p style={err}>{error}</p>}

            <button type="submit" disabled={loading} style={btn}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

const ls: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginTop: 16, marginBottom: 4 };
const is: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box" };
const err: React.CSSProperties = { color: "#dc2626", fontSize: 13, margin: "10px 0 0" };
const btn: React.CSSProperties = {
  width: "100%", marginTop: 24, padding: "12px", background: "#2563eb", color: "#fff",
  border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer",
};
