"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const INDUSTRY_LABELS: Record<string, string> = {
  LEGAL: "Legal", FINANCE: "Finanzas", HEALTHCARE: "Salud",
  REAL_ESTATE: "Bienes Raíces", TECH: "Tecnología", OTHER: "Otro",
};

interface CompanySummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  maxUsers: number;
  isActive: boolean;
  createdAt: string;
  activeUserCount: number;
  fileCount: number;
  storageBytes: number;
  logoUrl?: string | null;
  industry: string;
}

interface Stats {
  totalCompanies: number;
  activeCompanies: number;
  totalUsers: number;
}

interface Props {
  stats: Stats;
  companies: CompanySummary[];
}

const PLAN_COLORS: Record<string, { bg: string; fg: string }> = {
  BASIC:      { bg: "#f3f4f6", fg: "#374151" },
  PRO:        { bg: "#dbeafe", fg: "#1d4ed8" },
  ENTERPRISE: { bg: "#ede9fe", fg: "#6d28d9" },
};

const PLAN_LABELS: Record<string, string> = {
  BASIC: "Basic", PRO: "Pro", ENTERPRISE: "Enterprise",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function SuperAdminDashboard({ stats, companies: initial }: Props) {
  const router = useRouter();
  const [companies, setCompanies] = useState(initial);
  const [toggling, setToggling] = useState<string | null>(null);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function toggleActive(company: CompanySummary) {
    setToggling(company.id);
    try {
      const res = await fetch(`/api/superadmin/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !company.isActive }),
      });
      if (res.ok) {
        setCompanies((prev) =>
          prev.map((c) => c.id === company.id ? { ...c, isActive: !company.isActive } : c)
        );
      }
    } finally {
      setToggling(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      {/* ── Super Admin banner ── */}
      <div style={{ background: "#3CB54A", color: "#fff", padding: "6px 28px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>Super Admin Mode</span>
        <span style={{ fontSize: 12, opacity: 0.9 }}>— Gestión de Plataforma</span>
      </div>
      {/* ── Header ── */}
      <header style={{ background: "#1B3A6B", color: "#fff", padding: "12px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #3CB54A" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/ke-control-logo.png" alt="KE-Control" style={{ height: 36, width: "auto", background: "#fff", borderRadius: 6, padding: "2px 8px" }} />
          <span style={{ fontSize: 12, background: "rgba(60,181,74,0.2)", border: "1px solid #3CB54A", padding: "2px 8px", borderRadius: 4, color: "#3CB54A", fontWeight: 700 }}>
            SUPER ADMIN
          </span>
        </div>
        <button onClick={logout} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
          Cerrar sesión
        </button>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 28px" }}>

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
          {[
            { label: "Empresas totales", value: stats.totalCompanies, color: "#1B3A6B" },
            { label: "Empresas activas", value: stats.activeCompanies, color: "#3CB54A" },
            { label: "Usuarios totales", value: stats.totalUsers, color: "#1B3A6B" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px" }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>{label}</p>
              <p style={{ margin: "8px 0 0", fontSize: 32, fontWeight: 800, color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Companies table ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Companies</h2>
            <button
              onClick={() => router.push("/superadmin/companies/new")}
              style={{ background: "#1B3A6B", color: "#fff", border: "2px solid #3CB54A", padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
            >
              + Crear empresa
            </button>
          </div>

          {companies.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8" }}>
              <p style={{ margin: 0 }}>No companies yet. Create your first one.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {["Company", "Slug", "Industria", "Plan", "Users", "Files", "Storage", "Status", "Created", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => {
                    const pc = PLAN_COLORS[c.plan] ?? PLAN_COLORS.BASIC;
                    const isToggling = toggling === c.id;
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                        {/* Name — click to drill-down */}
                        <td style={{ padding: "12px 20px" }}>
                          <button
                            onClick={() => router.push(`/superadmin/companies/${c.slug}`)}
                            style={{ background: "none", border: "none", padding: 0, fontWeight: 700, color: "#2563eb", cursor: "pointer", fontSize: 14, textDecoration: "underline", display: "flex", alignItems: "center", gap: 8 }}
                          >
                            {c.logoUrl ? (
                              <img src={c.logoUrl} alt="" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4, border: "1px solid #e2e8f0", background: "#f8fafc", padding: 2, flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 24, height: 24, borderRadius: 4, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#64748b", flexShrink: 0 }}>
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            {c.name}
                          </button>
                        </td>
                        <td style={{ padding: "12px 20px" }}>
                          <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{c.slug}</code>
                        </td>
                        <td style={{ padding: "12px 20px", fontSize: 13, color: "#374151" }}>
                          {INDUSTRY_LABELS[c.industry] ?? c.industry}
                        </td>
                        <td style={{ padding: "12px 20px" }}>
                          <span style={{ background: pc.bg, color: pc.fg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                            {PLAN_LABELS[c.plan] ?? c.plan}
                          </span>
                        </td>
                        <td style={{ padding: "12px 20px", fontSize: 14, color: "#374151", fontWeight: 600 }}>
                          {c.activeUserCount} / {c.maxUsers}
                        </td>
                        <td style={{ padding: "12px 20px", fontSize: 14, color: "#374151" }}>{c.fileCount}</td>
                        <td style={{ padding: "12px 20px", fontSize: 13, color: "#64748b", whiteSpace: "nowrap" }}>{formatBytes(c.storageBytes)}</td>
                        <td style={{ padding: "12px 20px" }}>
                          <span style={{ color: c.isActive ? "#16a34a" : "#dc2626", fontWeight: 600, fontSize: 13 }}>
                            {c.isActive ? "● Active" : "● Inactive"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 20px", color: "#64748b", fontSize: 13, whiteSpace: "nowrap" }}>
                          {new Date(c.createdAt).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td style={{ padding: "12px 20px" }}>
                          <button
                            disabled={isToggling}
                            onClick={() => toggleActive(c)}
                            style={{
                              background: c.isActive ? "#fef2f2" : "#f0fdf4",
                              color: c.isActive ? "#dc2626" : "#16a34a",
                              border: `1px solid ${c.isActive ? "#fecaca" : "#bbf7d0"}`,
                              padding: "4px 12px", borderRadius: 6, cursor: isToggling ? "not-allowed" : "pointer",
                              fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                              opacity: isToggling ? 0.6 : 1,
                            }}
                          >
                            {isToggling ? "…" : c.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
