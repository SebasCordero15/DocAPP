"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  forcePasswordChange: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  detail: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
}

interface CompanyData {
  id: string;
  name: string;
  slug: string;
  plan: string;
  industry: string;
  isActive: boolean;
  maxUsers: number;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  customDomain: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  storageBytes: number;
  users: CompanyUser[];
}

interface Props {
  company: CompanyData;
  auditLogs: AuditEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const PLAN_COLORS: Record<string, { bg: string; fg: string }> = {
  BASIC:      { bg: "#f3f4f6", fg: "#374151" },
  PRO:        { bg: "#dbeafe", fg: "#1d4ed8" },
  ENTERPRISE: { bg: "#ede9fe", fg: "#6d28d9" },
};

const PLAN_LABELS: Record<string, string> = {
  BASIC: "Basic", PRO: "Pro", ENTERPRISE: "Enterprise",
};

const PLAN_LIMITS: Record<string, number> = {
  BASIC: 10, PRO: 50, ENTERPRISE: 250,
};

const ROLE_COLORS: Record<string, { bg: string; fg: string }> = {
  COMPANY_ADMIN: { bg: "#fef3c7", fg: "#92400e" },
  EDITOR:        { bg: "#e0f2fe", fg: "#0369a1" },
  VIEWER:        { bg: "#f3f4f6", fg: "#374151" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CompanyDetail({ company: initial, auditLogs }: Props) {
  const router = useRouter();
  const [company, setCompany] = useState(initial);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "audit">("users");
  const [editingPlan, setEditingPlan] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(initial.plan);
  const [savingPlan, setSavingPlan] = useState(false);

  const activeUserCount = company.users.filter((u) => u.isActive).length;

  async function savePlan() {
    setSavingPlan(true);
    const res = await fetch(`/api/superadmin/companies/${company.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: selectedPlan }),
    });
    if (res.ok) {
      setCompany((prev) => ({ ...prev, plan: selectedPlan, maxUsers: PLAN_LIMITS[selectedPlan] }));
      setEditingPlan(false);
    }
    setSavingPlan(false);
  }

  const downgradeWarning =
    editingPlan && selectedPlan !== company.plan && PLAN_LIMITS[selectedPlan] < activeUserCount
      ? `Warning: ${activeUserCount} active users exceed the ${PLAN_LABELS[selectedPlan]} limit of ${PLAN_LIMITS[selectedPlan]}. Users will not be removed but new invitations will be blocked.`
      : null;

  async function toggleActive() {
    setToggling(true);
    try {
      const res = await fetch(`/api/superadmin/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !company.isActive }),
      });
      if (res.ok) setCompany((prev) => ({ ...prev, isActive: !prev.isActive }));
    } finally {
      setToggling(false);
    }
  }

  const pc = PLAN_COLORS[company.plan] ?? PLAN_COLORS.BASIC;

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      {/* ── Header ── */}
      <header style={{ background: "#1e293b", color: "#fff", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: 17 }}>DocVault Admin</strong>
          <span style={{ fontSize: 12, background: "#334155", padding: "2px 8px", borderRadius: 4, marginLeft: 10, color: "#94a3b8" }}>
            SUPER_ADMIN
          </span>
        </div>
        <a href="/superadmin" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>← Dashboard</a>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 28px" }}>

        {/* ── Company header card ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "24px 28px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {company.logoUrl && (
                <img src={company.logoUrl} alt="logo" style={{ width: 52, height: 52, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, background: "#fff" }} />
              )}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#1e293b" }}>{company.name}</h1>
                  <span style={{ background: pc.bg, color: pc.fg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{PLAN_LABELS[company.plan] ?? company.plan}</span>
                  <span style={{ color: company.isActive ? "#16a34a" : "#dc2626", fontWeight: 600, fontSize: 13 }}>
                    {company.isActive ? "● Active" : "● Inactive"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>
                    <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4 }}>{company.slug}</code>
                  </span>
                  <span style={{ fontSize: 13, color: "#64748b" }}>{company.industry.replace("_", " ")}</span>
                  {company.customDomain && (
                    <span style={{ fontSize: 13, color: "#64748b" }}>{company.customDomain}</span>
                  )}
                </div>
              </div>
            </div>

            <button
              disabled={toggling}
              onClick={toggleActive}
              style={{
                background: company.isActive ? "#fef2f2" : "#f0fdf4",
                color: company.isActive ? "#dc2626" : "#16a34a",
                border: `1px solid ${company.isActive ? "#fecaca" : "#bbf7d0"}`,
                padding: "8px 18px", borderRadius: 8, cursor: toggling ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 700, opacity: toggling ? 0.6 : 1,
              }}
            >
              {toggling ? "…" : company.isActive ? "Deactivate Company" : "Activate Company"}
            </button>
          </div>

          {/* ── Stats row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginTop: 24, paddingTop: 20, borderTop: "1px solid #f1f5f9" }}>
            {[
              { label: "Users", value: `${activeUserCount} / ${company.maxUsers}`, color: "#2563eb" },
              { label: "Files", value: String(company.fileCount), color: "#d97706" },
              { label: "Storage Used", value: formatBytes(company.storageBytes), color: "#7c3aed" },
              { label: "Created", value: new Date(company.createdAt).toLocaleDateString(), color: "#374151" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>{label}</p>
                <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700, color }}>{value}</p>
              </div>
            ))}
            {/* Plan selector */}
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>Plan</p>
              {editingPlan ? (
                <div style={{ marginTop: 4 }}>
                  <select
                    value={selectedPlan}
                    onChange={(e) => setSelectedPlan(e.target.value)}
                    style={{ padding: "3px 6px", border: "1px solid #d1d5db", borderRadius: 5, fontSize: 13, marginBottom: 4 }}
                  >
                    <option value="BASIC">Basic — up to 10 users</option>
                    <option value="PRO">Pro — up to 50 users</option>
                    <option value="ENTERPRISE">Enterprise — up to 250 users</option>
                  </select>
                  {downgradeWarning && (
                    <p style={{ margin: "0 0 4px", fontSize: 11, color: "#dc2626", fontWeight: 600, maxWidth: 200 }}>{downgradeWarning}</p>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={savePlan} disabled={savingPlan} style={{ background: "#2563eb", color: "#fff", border: "none", padding: "3px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                      {savingPlan ? "…" : "Save"}
                    </button>
                    <button onClick={() => { setEditingPlan(false); setSelectedPlan(company.plan); }} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#374151" }}>{PLAN_LABELS[company.plan] ?? company.plan}</p>
                  <button onClick={() => setEditingPlan(true)} style={{ background: "none", border: "1px solid #e2e8f0", color: "#64748b", padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 11 }}>Change</button>
                </div>
              )}
            </div>
          </div>

          {/* ── Branding swatch ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
            <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>BRANDING</span>
            {[
              { label: "Primary", val: company.primaryColor },
              { label: "Secondary", val: company.secondaryColor },
              { label: "Accent", val: company.accentColor },
            ].map(({ label, val }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div title={val} style={{ width: 18, height: 18, borderRadius: 4, background: val, border: "1px solid #e2e8f0" }} />
                <span style={{ fontSize: 12, color: "#64748b" }}>{val}</span>
              </div>
            ))}
            <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>
              Font: <span style={{ fontFamily: company.fontFamily, fontWeight: 600 }}>{company.fontFamily}</span>
            </span>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 20 }}>
          {(["users", "audit"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: "none", border: "none", padding: "10px 20px", cursor: "pointer",
                fontSize: 14, fontWeight: 700,
                color: activeTab === tab ? "#2563eb" : "#64748b",
                borderBottom: `3px solid ${activeTab === tab ? "#2563eb" : "transparent"}`,
                marginBottom: -2,
              }}
            >
              {tab === "users" ? `Users (${company.users.length})` : `Audit Log (${auditLogs.length})`}
            </button>
          ))}
        </div>

        {/* ── Users tab ── */}
        {activeTab === "users" && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            {company.users.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No users yet.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {["Name", "Email", "Role", "Status", "Last Login", "Joined"].map((h) => (
                      <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {company.users.map((u) => {
                    const rc = ROLE_COLORS[u.role] ?? ROLE_COLORS.VIEWER;
                    return (
                      <tr key={u.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                        <td style={{ padding: "12px 20px", fontWeight: 600, color: u.isActive ? "#1e293b" : "#94a3b8" }}>
                          {u.name}
                          {u.forcePasswordChange && (
                            <span title="Must change password" style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: 3, marginLeft: 6 }}>TEMP PW</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 20px", fontSize: 13, color: "#64748b" }}>{u.email}</td>
                        <td style={{ padding: "12px 20px" }}>
                          <span style={{ background: rc.bg, color: rc.fg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: "12px 20px" }}>
                          <span style={{ color: u.isActive ? "#16a34a" : "#dc2626", fontSize: 13, fontWeight: 600 }}>
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 20px", fontSize: 13, color: "#64748b" }}>
                          {u.lastLoginAt ? timeAgo(u.lastLoginAt) : <span style={{ color: "#d1d5db" }}>Never</span>}
                        </td>
                        <td style={{ padding: "12px 20px", fontSize: 13, color: "#64748b" }}>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Audit tab ── */}
        {activeTab === "audit" && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            {auditLogs.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No audit entries yet.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {["Action", "By", "Resource", "Detail", "When"].map((h) => (
                      <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((l) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "11px 20px" }}>
                        <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{l.action}</code>
                      </td>
                      <td style={{ padding: "11px 20px", fontSize: 13, color: "#374151" }}>
                        {l.user ? (
                          <span title={l.user.email}>{l.user.name}</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "11px 20px", fontSize: 12, color: "#64748b" }}>
                        {l.resourceType ?? "—"}
                      </td>
                      <td style={{ padding: "11px 20px", fontSize: 13, color: "#64748b", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.detail ?? "—"}
                      </td>
                      <td style={{ padding: "11px 20px", fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>
                        {timeAgo(l.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
