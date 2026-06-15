"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "COMPANY_ADMIN" | "EDITOR" | "VIEWER";

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  forcePasswordChange: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
}

interface Props {
  currentUserId: string;
  company: { name: string; primaryColor: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const ROLE_COLORS: Record<Role, { bg: string; fg: string }> = {
  COMPANY_ADMIN: { bg: "#fef3c7", fg: "#92400e" },
  EDITOR:        { bg: "#e0f2fe", fg: "#0369a1" },
  VIEWER:        { bg: "#f3f4f6", fg: "#374151" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamClient({ currentUserId, company }: Props) {
  const router = useRouter();
  const brand = company.primaryColor;

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [maxUsers, setMaxUsers] = useState<number>(10);
  const [activeUserCount, setActiveUserCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("VIEWER");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string; emailSent: boolean } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Per-user mutation state
  const [mutating, setMutating] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const d = await res.json();
      setUsers(d.users);
      setInvites(d.invites);
      setMaxUsers(d.maxUsers ?? 10);
      setActiveUserCount(d.activeUserCount ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patchUser(id: string, update: { role?: Role; isActive?: boolean }) {
    setMutating((m) => ({ ...m, [id]: true }));
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (res.ok) {
      const { user } = await res.json();
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, ...user } : u));
    }
    setMutating((m) => ({ ...m, [id]: false }));
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteResult(null);
    const res = await fetch("/api/admin/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const d = await res.json();
    if (!res.ok) {
      setInviteError(d.error ?? "Failed to send invite");
    } else {
      setInviteResult({ inviteUrl: d.inviteUrl, emailSent: d.emailSent });
      setInviteEmail("");
      setInviteRole("VIEWER");
      await load();
    }
    setInviting(false);
  }

  async function revokeInvite(id: string) {
    const res = await fetch(`/api/admin/users/${id}?inviteId=${id}`, { method: "DELETE" });
    if (res.ok) setInvites((prev) => prev.filter((i) => i.id !== id));
  }

  async function copyInviteLink(inviteId: string) {
    // Re-fetch to get the token (not stored client-side for security)
    // Instead, show a toast that invite was already created — user should check email or use the URL shown at creation time.
    // For simplicity we ask admin to resend: revoke + re-invite.
    alert("To get the invite link again, revoke this invite and create a new one.");
  }

  const activeUsers = users.filter((u) => u.isActive);

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      {/* ── Header ── */}
      <header style={{ background: brand, color: "#fff", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 17 }}>{company.name} · DocVault</strong>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={() => router.push("/dashboard")} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
            ← Dashboard
          </button>
          <button onClick={() => router.push("/dashboard/permissions")} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
            Permissions
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 28px" }}>

        {/* ── Page title + invite button ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#1e293b" }}>Team</h1>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
              <span style={{ fontWeight: 700, color: activeUserCount >= maxUsers ? "#dc2626" : "#374151" }}>
                Users: {activeUserCount} / {maxUsers}
              </span>
              {" · "}{invites.length} pending invite{invites.length !== 1 ? "s" : ""}
            </p>
            {activeUserCount >= maxUsers && (
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#dc2626" }}>
                User limit reached. Deactivate a user or contact support to increase the limit.
              </p>
            )}
          </div>
          <button
            onClick={() => { setShowInvite((v) => !v); setInviteResult(null); setInviteError(null); }}
            style={{ background: brand, color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14 }}
          >
            {showInvite ? "Cancel" : "+ Invite User"}
          </button>
        </div>

        {/* ── Invite form ── */}
        {showInvite && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "22px 24px", marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Send invitation</h3>
            <form onSubmit={sendInvite} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Email address *</span>
                <input
                  type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  style={{ padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 14 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Role</span>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} style={{ padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 14, background: "#fff" }}>
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                  <option value="COMPANY_ADMIN">Company Admin</option>
                </select>
              </label>
              <button type="submit" disabled={inviting} style={{ background: brand, color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14, opacity: inviting ? 0.7 : 1 }}>
                {inviting ? "Sending…" : "Send invite"}
              </button>
            </form>

            {inviteError && (
              <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{inviteError}</p>
            )}

            {inviteResult && (
              <div style={{ marginTop: 14, background: inviteResult.emailSent ? "#f0fdf4" : "#fff7ed", border: `1px solid ${inviteResult.emailSent ? "#bbf7d0" : "#fed7aa"}`, borderRadius: 8, padding: "12px 16px" }}>
                {inviteResult.emailSent ? (
                  <p style={{ margin: 0, color: "#166534", fontSize: 13 }}>Invite email sent.</p>
                ) : (
                  <>
                    <p style={{ margin: "0 0 8px", color: "#92400e", fontSize: 13, fontWeight: 600 }}>Email not sent (RESEND_API_KEY not set) — share this link manually:</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <code style={{ flex: 1, background: "#fff", border: "1px solid #fed7aa", borderRadius: 6, padding: "8px 12px", fontSize: 12, wordBreak: "break-all" }}>
                        {inviteResult.inviteUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(inviteResult.inviteUrl)}
                        style={{ background: "#d97706", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 12, flexShrink: 0 }}
                      >
                        Copy
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Users table ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Members</h2>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading…</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  {["Name", "Email", "Role", "Status", "Last Login", "Actions"].map((h) => (
                    <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const busy = mutating[u.id] ?? false;
                  const rc = ROLE_COLORS[u.role] ?? ROLE_COLORS.VIEWER;
                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid #f8fafc", opacity: u.isActive ? 1 : 0.6 }}>
                      <td style={{ padding: "12px 20px", fontWeight: 600, color: "#1e293b" }}>
                        {u.name}
                        {isSelf && <span style={{ fontSize: 10, background: "#e0f2fe", color: "#0369a1", padding: "1px 5px", borderRadius: 3, marginLeft: 6 }}>You</span>}
                        {u.forcePasswordChange && <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>TEMP PW</span>}
                      </td>
                      <td style={{ padding: "12px 20px", fontSize: 13, color: "#64748b" }}>{u.email}</td>
                      <td style={{ padding: "12px 20px" }}>
                        {isSelf ? (
                          <span style={{ background: rc.bg, color: rc.fg, padding: "3px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{u.role}</span>
                        ) : (
                          <select
                            value={u.role}
                            disabled={busy}
                            onChange={(e) => patchUser(u.id, { role: e.target.value as Role })}
                            style={{ background: rc.bg, color: rc.fg, border: "1px solid transparent", borderRadius: 4, fontSize: 12, fontWeight: 600, padding: "3px 6px", cursor: "pointer" }}
                          >
                            <option value="VIEWER">Viewer</option>
                            <option value="EDITOR">Editor</option>
                            <option value="COMPANY_ADMIN">Company Admin</option>
                          </select>
                        )}
                      </td>
                      <td style={{ padding: "12px 20px" }}>
                        <span style={{ color: u.isActive ? "#16a34a" : "#dc2626", fontSize: 13, fontWeight: 600 }}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 20px", fontSize: 13, color: "#64748b" }}>
                        {u.lastLoginAt ? timeAgo(u.lastLoginAt) : <span style={{ color: "#d1d5db" }}>Never</span>}
                      </td>
                      <td style={{ padding: "12px 20px" }}>
                        {!isSelf && (
                          <button
                            disabled={busy}
                            onClick={() => patchUser(u.id, { isActive: !u.isActive })}
                            style={{
                              background: u.isActive ? "#fef2f2" : "#f0fdf4",
                              color: u.isActive ? "#dc2626" : "#16a34a",
                              border: `1px solid ${u.isActive ? "#fecaca" : "#bbf7d0"}`,
                              padding: "4px 12px", borderRadius: 6, cursor: busy ? "not-allowed" : "pointer",
                              fontSize: 12, fontWeight: 600, opacity: busy ? 0.5 : 1,
                            }}
                          >
                            {busy ? "…" : u.isActive ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pending invites ── */}
        {invites.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                Pending Invitations <span style={{ fontSize: 13, fontWeight: 400, color: "#94a3b8" }}>({invites.length})</span>
              </h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  {["Email", "Role", "Sent", "Expires", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const rc = ROLE_COLORS[inv.role] ?? ROLE_COLORS.VIEWER;
                  return (
                    <tr key={inv.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "11px 20px", fontSize: 14, color: "#374151" }}>{inv.email}</td>
                      <td style={{ padding: "11px 20px" }}>
                        <span style={{ background: rc.bg, color: rc.fg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{inv.role}</span>
                      </td>
                      <td style={{ padding: "11px 20px", fontSize: 13, color: "#64748b" }}>{timeAgo(inv.createdAt)}</td>
                      <td style={{ padding: "11px 20px", fontSize: 13, color: "#64748b" }}>
                        {new Date(inv.expiresAt).toLocaleDateString()} {new Date(inv.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "11px 20px" }}>
                        <button
                          onClick={() => revokeInvite(inv.id)}
                          style={{ background: "none", border: "1px solid #fecaca", color: "#dc2626", padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                        >
                          Revoke
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
    </main>
  );
}
