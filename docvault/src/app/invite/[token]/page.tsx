"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface InviteInfo {
  email: string;
  role: string;
  expiresAt: string;
  company: { name: string; slug: string; logoUrl: string | null; primaryColor: string };
}

export default function AcceptInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invite/${params.token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) { setLoadError(d.error ?? "Invalid invitation"); return; }
        setInfo(d);
      })
      .catch(() => setLoadError("Failed to load invitation"));
  }, [params.token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/invite/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to create account"); return; }
      window.location.href = "/dashboard";
    } finally {
      setSubmitting(false);
    }
  }

  const brand = info?.company.primaryColor ?? "#2563eb";

  if (loadError) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9" }}>
        <div style={{ background: "#fff", padding: 40, borderRadius: 14, textAlign: "center", maxWidth: 400, border: "1px solid #e2e8f0" }}>
          <h2 style={{ color: "#1e293b", margin: "0 0 8px" }}>Invitation unavailable</h2>
          <p style={{ color: "#64748b", margin: "0 0 20px" }}>{loadError}</p>
          <a href="/login" style={{ color: "#2563eb", fontSize: 14 }}>Go to login →</a>
        </div>
      </main>
    );
  }

  if (!info) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9" }}>
        <p style={{ color: "#64748b" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9" }}>
      <form
        onSubmit={submit}
        style={{ width: 400, background: "#fff", padding: 36, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}
      >
        {/* Company header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          {info.company.logoUrl && (
            <img src={info.company.logoUrl} alt="" style={{ width: 40, height: 40, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 6, padding: 2 }} />
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>Invitation</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#1e293b" }}>{info.company.name}</div>
          </div>
        </div>

        <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 4px" }}>
          You're invited to join as <strong style={{ color: "#1e293b" }}>{info.role}</strong>.
        </p>
        <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 24px" }}>
          Email: {info.email} · Expires {new Date(info.expiresAt).toLocaleDateString()}
        </p>

        <label style={ls}>Full name *</label>
        <input style={is} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" required />

        <label style={ls}>Password * <span style={{ fontWeight: 400, color: "#94a3b8" }}>(min 8 characters)</span></label>
        <input style={is} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        <label style={ls}>Confirm password *</label>
        <input style={is} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />

        {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{ width: "100%", marginTop: 24, padding: "12px", background: brand, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? "Creating account…" : "Create account & sign in"}
        </button>

        <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 14, textAlign: "center" }}>
          Already have an account? <a href="/login" style={{ color: brand }}>Sign in →</a>
        </p>
      </form>
    </main>
  );
}

const ls: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginTop: 16, marginBottom: 4 };
const is: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box" };
