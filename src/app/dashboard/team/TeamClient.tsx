"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Copy, Check, KeyRound, Pencil, X, UserPlus, Send } from "lucide-react";

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
  company: { name: string; primaryColor: string; fontFamily: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const ROLE_COLORS: Record<Role, { bg: string; fg: string }> = {
  COMPANY_ADMIN: { bg: "#fef3c7", fg: "#92400e" },
  EDITOR:        { bg: "#e0f2fe", fg: "#0369a1" },
  VIEWER:        { bg: "#f3f4f6", fg: "#374151" },
};

const ROLE_LABELS: Record<Role, string> = {
  COMPANY_ADMIN: "Admin",
  EDITOR:        "Editor",
  VIEWER:        "Lector",
};

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copy}
      style={{ display: "flex", alignItems: "center", gap: 5, background: copied ? "#f0fdf4" : "#fff", color: copied ? "#16a34a" : "#374151", border: `1px solid ${copied ? "#bbf7d0" : "#d1d5db"}`, padding: "6px 12px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, flexShrink: 0 }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "¡Copiado!" : "Copiar"}
    </button>
  );
}

// ─── TempPasswordBox ──────────────────────────────────────────────────────────

function TempPasswordBox({ password, userName, userEmail, onClose }: { password: string; userName: string; userEmail: string; onClose: () => void }) {
  return (
    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "16px 18px", marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <p style={{ margin: 0, color: "#92400e", fontWeight: 700, fontSize: 13 }}>
          ✓ Contraseña temporal generada para {userName}
        </p>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}><X size={16} /></button>
      </div>
      <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: 12 }}>
        Esta contraseña se muestra <strong>una sola vez</strong>. Compártela con {userEmail} de forma segura. El usuario deberá cambiarla al iniciar sesión.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <code style={{ flex: 1, background: "#fff", border: "1px solid #fed7aa", borderRadius: 7, padding: "10px 14px", fontSize: 16, fontWeight: 700, letterSpacing: 2, color: "#1e293b" }}>
          {password}
        </code>
        <CopyButton text={password} />
      </div>
    </div>
  );
}

// ─── ResetPasswordModal ───────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: TeamUser; onClose: () => void }) {
  const [useCustom,  setUseCustom]  = useState(false);
  const [customPw,   setCustomPw]   = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [tempPw,     setTempPw]     = useState<string | null>(null);

  async function doReset() {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(useCustom && customPw ? { customPassword: customPw } : {}),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Error al restablecer contraseña");
    } else {
      setTempPw(d.tempPassword);
    }
    setSaving(false);
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={19} color="#d97706" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Restablecer contraseña</h3>
          </div>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        {!tempPw ? (
          <>
            <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px" }}>
              Restableciendo contraseña de <strong>{user.name}</strong> ({user.email}).
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, marginBottom: 14 }}>
              <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
              Especificar contraseña manualmente
            </label>
            {useCustom && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Contraseña temporal</label>
                <input
                  type="text"
                  value={customPw}
                  onChange={(e) => setCustomPw(e.target.value)}
                  placeholder="Mín. 8 chars · mayúscula · minúscula · número"
                  style={inp}
                />
              </div>
            )}
            {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={cancelBtn}>Cancelar</button>
              <button onClick={doReset} disabled={saving || (useCustom && !customPw)} style={{ ...actionBtn, background: "#d97706", opacity: (saving || (useCustom && !customPw)) ? 0.6 : 1 }}>
                {saving ? "…" : "Restablecer"}
              </button>
            </div>
          </>
        ) : (
          <>
            <TempPasswordBox password={tempPw} userName={user.name} userEmail={user.email} onClose={onClose} />
            <button onClick={onClose} style={{ ...actionBtn, marginTop: 16, display: "block", width: "100%" }}>Cerrar</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── EditUserModal ────────────────────────────────────────────────────────────

function EditUserModal({ user, onSave, onClose }: { user: TeamUser; onSave: (u: Partial<TeamUser>) => void; onClose: () => void }) {
  const [name,  setName]  = useState(user.name);
  const [role,  setRole]  = useState<Role>(user.role);
  const [saving, setSaving] = useState(false);
  const [error, setError]  = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(name !== user.name ? { name } : {}),
        ...(role !== user.role ? { role } : {}),
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Error al guardar");
    } else {
      onSave({ name, role, ...d.user });
      onClose();
    }
    setSaving(false);
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Pencil size={17} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Editar usuario</h3>
          </div>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Nombre</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inp} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Correo (no editable)</label>
          <input type="email" value={user.email} disabled style={{ ...inp, color: "#94a3b8", background: "#f8fafc" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Rol base</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={inp}>
            <option value="VIEWER">Lector (solo lectura)</option>
            <option value="EDITOR">Editor (puede subir y editar)</option>
            <option value="COMPANY_ADMIN">Admin de empresa</option>
          </select>
        </div>

        {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={cancelBtn}>Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim()} style={{ ...actionBtn, opacity: (saving || !name.trim()) ? 0.6 : 1 }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function TeamClient({ currentUserId, company }: Props) {
  const brand = company.primaryColor;

  const [users,           setUsers]           = useState<TeamUser[]>([]);
  const [invites,         setInvites]         = useState<PendingInvite[]>([]);
  const [maxUsers,        setMaxUsers]        = useState<number>(10);
  const [activeUserCount, setActiveUserCount] = useState<number>(0);
  const [loading,         setLoading]         = useState(true);

  // Create mode: "invite" (email link) | "direct" (temp password)
  const [createMode,  setCreateMode]  = useState<"invite" | "direct">("direct");
  const [showCreate,  setShowCreate]  = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole,  setInviteRole]  = useState<Role>("VIEWER");
  const [inviting,    setInviting]    = useState(false);
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string; emailSent: boolean } | null>(null);
  const [inviteError,  setInviteError]  = useState<string | null>(null);

  // Direct create form
  const [dcName,    setDcName]    = useState("");
  const [dcEmail,   setDcEmail]   = useState("");
  const [dcRole,    setDcRole]    = useState<Role>("VIEWER");
  const [dcSaving,  setDcSaving]  = useState(false);
  const [dcError,   setDcError]   = useState<string | null>(null);
  const [dcResult,  setDcResult]  = useState<{ tempPassword: string; user: TeamUser } | null>(null);

  // Per-user actions
  const [mutating,     setMutating]     = useState<Record<string, boolean>>({});
  const [mutateError,  setMutateError]  = useState<Record<string, string>>({});
  const [resetTarget,  setResetTarget]  = useState<TeamUser | null>(null);
  const [editTarget,   setEditTarget]   = useState<TeamUser | null>(null);

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
    setMutateError((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setUsers((prev) => prev.map((u) => u.id === d.user.id ? { ...u, ...d.user } : u));
      } else {
        setMutateError((e) => ({ ...e, [id]: d.error ?? "Error al actualizar" }));
      }
    } catch {
      setMutateError((e) => ({ ...e, [id]: "Error de conexión" }));
    } finally {
      setMutating((m) => ({ ...m, [id]: false }));
    }
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
      setInviteError(d.error ?? "Error al enviar invitación");
    } else {
      setInviteResult({ inviteUrl: d.inviteUrl, emailSent: d.emailSent });
      setInviteEmail("");
      setInviteRole("VIEWER");
      await load();
    }
    setInviting(false);
  }

  async function createDirect(e: React.FormEvent) {
    e.preventDefault();
    setDcSaving(true);
    setDcError(null);
    setDcResult(null);
    const res = await fetch("/api/admin/users/create-direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: dcName, email: dcEmail, role: dcRole }),
    });
    const d = await res.json();
    if (!res.ok) {
      setDcError(d.error ?? "Error al crear usuario");
    } else {
      setDcResult({ tempPassword: d.tempPassword, user: d.user });
      setDcName("");
      setDcEmail("");
      setDcRole("VIEWER");
      await load();
    }
    setDcSaving(false);
  }

  async function revokeInvite(id: string) {
    const res = await fetch(`/api/admin/users/${id}?inviteId=${id}`, { method: "DELETE" });
    if (res.ok) setInvites((prev) => prev.filter((i) => i.id !== id));
  }

  function openCreate() {
    setShowCreate(true);
    setInviteResult(null);
    setInviteError(null);
    setDcResult(null);
    setDcError(null);
  }

  const atLimit = activeUserCount >= maxUsers;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f1f5f9", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      {/* Section header */}
      <div style={{ background: brand, color: "#fff", padding: "12px 28px", position: "sticky", top: 0, zIndex: 10 }}>
        <strong style={{ fontSize: 16 }}>Equipo</strong>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 28px" }}>

        {/* ── Page title + add button ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#1e293b" }}>Equipo</h1>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
              <span style={{ fontWeight: 700, color: atLimit ? "#dc2626" : "#374151" }}>
                Usuarios: {activeUserCount} / {maxUsers}
              </span>
              {invites.length > 0 && ` · ${invites.length} invitación${invites.length !== 1 ? "es" : ""} pendiente${invites.length !== 1 ? "s" : ""}`}
            </p>
            {atLimit && (
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#dc2626" }}>
                Límite de usuarios alcanzado. Desactiva un usuario o contacta soporte para ampliar el plan.
              </p>
            )}
          </div>
          <button
            onClick={() => showCreate ? setShowCreate(false) : openCreate()}
            style={{ display: "flex", alignItems: "center", gap: 6, background: showCreate ? "#f1f5f9" : brand, color: showCreate ? "#64748b" : "#fff", border: showCreate ? "1px solid #e2e8f0" : "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14 }}
          >
            {showCreate ? <><X size={15} /> Cancelar</> : <><UserPlus size={15} /> Agregar usuario</>}
          </button>
        </div>

        {/* ── Add user panel ── */}
        {showCreate && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "22px 24px", marginBottom: 24 }}>
            {/* Mode tabs */}
            <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 20 }}>
              {([["direct", <><UserPlus size={13} /> Crear con contraseña temporal</>], ["invite", <><Send size={13} /> Enviar enlace de invitación</>]] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCreateMode(mode as "direct" | "invite")}
                  style={{ background: "none", border: "none", padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: createMode === mode ? brand : "#64748b", borderBottom: `3px solid ${createMode === mode ? brand : "transparent"}`, marginBottom: -2 }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Direct create form */}
            {createMode === "direct" && (
              <>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
                  Crea el usuario inmediatamente con una contraseña temporal que puedes compartir directamente (sin necesitar correo electrónico).
                </p>
                <form onSubmit={createDirect}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={lbl}>Nombre completo *</label>
                      <input type="text" required value={dcName} onChange={(e) => setDcName(e.target.value)} placeholder="Juan Pérez" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Correo electrónico *</label>
                      <input type="email" required value={dcEmail} onChange={(e) => setDcEmail(e.target.value)} placeholder="juan@empresa.com" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Rol</label>
                      <select value={dcRole} onChange={(e) => setDcRole(e.target.value as Role)} style={inp}>
                        <option value="VIEWER">Lector (solo lectura)</option>
                        <option value="EDITOR">Editor (puede subir y editar)</option>
                        <option value="COMPANY_ADMIN">Admin de empresa</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button type="submit" disabled={dcSaving || atLimit} style={{ ...actionBtn, width: "100%", opacity: (dcSaving || atLimit) ? 0.6 : 1 }}>
                        {dcSaving ? "Creando…" : "Crear usuario"}
                      </button>
                    </div>
                  </div>
                  {dcError && <p style={{ color: "#dc2626", fontSize: 13, margin: "4px 0 0" }}>{dcError}</p>}
                </form>

                {dcResult && (
                  <TempPasswordBox
                    password={dcResult.tempPassword}
                    userName={dcResult.user.name}
                    userEmail={dcResult.user.email}
                    onClose={() => setDcResult(null)}
                  />
                )}
              </>
            )}

            {/* Invite form */}
            {createMode === "invite" && (
              <>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
                  Envía un enlace de invitación. El usuario hará clic en el enlace y creará su propia contraseña.
                </p>
                <form onSubmit={sendInvite} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: "1 1 220px" }}>
                    <label style={lbl}>Correo electrónico *</label>
                    <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colega@empresa.com" style={inp} />
                  </div>
                  <div style={{ flex: "0 0 180px" }}>
                    <label style={lbl}>Rol</label>
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} style={inp}>
                      <option value="VIEWER">Lector</option>
                      <option value="EDITOR">Editor</option>
                      <option value="COMPANY_ADMIN">Admin de empresa</option>
                    </select>
                  </div>
                  <button type="submit" disabled={inviting || atLimit} style={{ ...actionBtn, opacity: (inviting || atLimit) ? 0.6 : 1 }}>
                    {inviting ? "Enviando…" : "Enviar invitación"}
                  </button>
                </form>
                {inviteError && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{inviteError}</p>}
                {inviteResult && (
                  <div style={{ marginTop: 14, background: inviteResult.emailSent ? "#f0fdf4" : "#fff7ed", border: `1px solid ${inviteResult.emailSent ? "#bbf7d0" : "#fed7aa"}`, borderRadius: 8, padding: "12px 16px" }}>
                    {inviteResult.emailSent ? (
                      <p style={{ margin: 0, color: "#166534", fontSize: 13 }}>✓ Correo de invitación enviado.</p>
                    ) : (
                      <>
                        <p style={{ margin: "0 0 8px", color: "#92400e", fontSize: 13, fontWeight: 600 }}>Correo no enviado (RESEND_API_KEY no configurado) — comparte este enlace manualmente:</p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <code style={{ flex: 1, background: "#fff", border: "1px solid #fed7aa", borderRadius: 6, padding: "8px 12px", fontSize: 12, wordBreak: "break-all" }}>
                            {inviteResult.inviteUrl}
                          </code>
                          <CopyButton text={inviteResult.inviteUrl} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Users table ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Miembros</h2>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Cargando…</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {["Nombre", "Correo", "Rol", "Estado", "Último acceso", "Acciones"].map((h) => (
                      <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const busy   = mutating[u.id] ?? false;
                    const err    = mutateError[u.id] ?? "";
                    const rc     = ROLE_COLORS[u.role] ?? ROLE_COLORS.VIEWER;
                    return (
                      <tr key={u.id} style={{ borderBottom: "1px solid #f8fafc", opacity: u.isActive ? 1 : 0.6 }}>
                        <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap" }}>
                          {u.name}
                          {isSelf && <span style={{ fontSize: 10, background: "#e0f2fe", color: "#0369a1", padding: "1px 5px", borderRadius: 3, marginLeft: 6 }}>Tú</span>}
                          {u.forcePasswordChange && <span title="Debe cambiar contraseña" style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>TEMP</span>}
                        </td>
                        <td style={{ padding: "12px 18px", fontSize: 13, color: "#64748b" }}>{u.email}</td>
                        <td style={{ padding: "12px 18px" }}>
                          {isSelf ? (
                            <span style={{ background: rc.bg, color: rc.fg, padding: "3px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{ROLE_LABELS[u.role]}</span>
                          ) : (
                            <select
                              value={u.role}
                              disabled={busy}
                              onChange={(e) => patchUser(u.id, { role: e.target.value as Role })}
                              style={{ background: rc.bg, color: rc.fg, border: "1px solid transparent", borderRadius: 4, fontSize: 12, fontWeight: 600, padding: "3px 6px", cursor: "pointer" }}
                            >
                              <option value="VIEWER">Lector</option>
                              <option value="EDITOR">Editor</option>
                              <option value="COMPANY_ADMIN">Admin</option>
                            </select>
                          )}
                        </td>
                        <td style={{ padding: "12px 18px" }}>
                          <span style={{ color: u.isActive ? "#16a34a" : "#dc2626", fontSize: 13, fontWeight: 600 }}>
                            {u.isActive ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 18px", fontSize: 13, color: "#64748b", whiteSpace: "nowrap" }}>
                          {u.lastLoginAt ? timeAgo(u.lastLoginAt) : <span style={{ color: "#d1d5db" }}>Nunca</span>}
                        </td>
                        <td style={{ padding: "12px 18px" }}>
                          {!isSelf && (
                            <div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button
                                  disabled={busy}
                                  onClick={() => setEditTarget(u)}
                                  style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", padding: "4px 10px", borderRadius: 6, cursor: busy ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}
                                >
                                  <Pencil size={12} /> Editar
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => setResetTarget(u)}
                                  style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff7ed", color: "#d97706", border: "1px solid #fed7aa", padding: "4px 10px", borderRadius: 6, cursor: busy ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}
                                >
                                  <KeyRound size={12} /> Contraseña
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => patchUser(u.id, { isActive: !u.isActive })}
                                  style={{ background: u.isActive ? "#fef2f2" : "#f0fdf4", color: u.isActive ? "#dc2626" : "#16a34a", border: `1px solid ${u.isActive ? "#fecaca" : "#bbf7d0"}`, padding: "4px 10px", borderRadius: 6, cursor: busy ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, opacity: busy ? 0.5 : 1 }}
                                >
                                  {busy ? "…" : u.isActive ? "Desactivar" : "Activar"}
                                </button>
                              </div>
                              {err && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#dc2626" }}>{err}</p>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Departamentos ── */}
        <DepartamentosSection brand={brand} />

        {/* ── Pending invites ── */}
        {invites.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                Invitaciones pendientes <span style={{ fontSize: 13, fontWeight: 400, color: "#94a3b8" }}>({invites.length})</span>
              </h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  {["Correo", "Rol", "Enviada", "Expira", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const rc = ROLE_COLORS[inv.role] ?? ROLE_COLORS.VIEWER;
                  return (
                    <tr key={inv.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "11px 18px", fontSize: 14, color: "#374151" }}>{inv.email}</td>
                      <td style={{ padding: "11px 18px" }}>
                        <span style={{ background: rc.bg, color: rc.fg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{ROLE_LABELS[inv.role]}</span>
                      </td>
                      <td style={{ padding: "11px 18px", fontSize: 13, color: "#64748b" }}>{timeAgo(inv.createdAt)}</td>
                      <td style={{ padding: "11px 18px", fontSize: 13, color: "#64748b" }}>
                        {new Date(inv.expiresAt).toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </td>
                      <td style={{ padding: "11px 18px" }}>
                        <button
                          onClick={() => revokeInvite(inv.id)}
                          style={{ background: "none", border: "1px solid #fecaca", color: "#dc2626", padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                        >
                          Revocar
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

      {/* ── Modals ── */}
      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => { setResetTarget(null); load(); }} />
      )}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          onSave={(updated) => {
            setUsers((prev) => prev.map((u) => u.id === editTarget.id ? { ...u, ...updated } : u));
          }}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

// ─── DepartamentosSection ─────────────────────────────────────────────────────

interface Department { id: string; name: string; }

function DepartamentosSection({ brand }: { brand: string }) {
  const [depts,    setDepts]    = useState<Department[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [newName,  setNewName]  = useState("");
  const [creating, setCreating] = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  async function load() {
    setLoading(true);
    const d = await fetch("/api/admin/departments").then((r) => r.json()).catch(() => ({}));
    setDepts(d.departments ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!newName.trim()) return;
    setCreating(true); setError("");
    const res = await fetch("/api/admin/departments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Error al crear"); }
    else { setNewName(""); load(); }
    setCreating(false);
  }

  async function save(id: string) {
    if (!editName.trim()) return;
    setSaving(true); setError("");
    const res = await fetch(`/api/admin/departments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Error al guardar"); }
    else { setEditId(null); load(); }
    setSaving(false);
  }

  async function remove(dept: Department) {
    setError("");
    const res = await fetch(`/api/admin/departments/${dept.id}`, { method: "DELETE" });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "No se puede eliminar"); }
    else { load(); }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "18px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Departamentos</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b" }}>Define los departamentos disponibles al crear documentos.</p>
        </div>
      </div>

      <div style={{ padding: "18px 24px" }}>
        {/* Create new */}
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <input
            style={{ ...inp, flex: 1 }}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del nuevo departamento…"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button
            onClick={create}
            disabled={creating || !newName.trim()}
            style={{ ...actionBtn, background: brand, opacity: newName.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}
          >
            {creating ? "Guardando…" : "+ Agregar"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#dc2626" }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", padding: "20px 0" }}>Cargando…</p>
        ) : depts.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", padding: "20px 0" }}>No hay departamentos definidos.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {depts.map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
                {editId === d.id ? (
                  <>
                    <input
                      style={{ ...inp, flex: 1, padding: "7px 10px" }}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && save(d.id)}
                      autoFocus
                    />
                    <button onClick={() => save(d.id)} disabled={saving} style={{ ...actionBtn, background: brand, padding: "7px 14px" }}>
                      {saving ? "…" : "Guardar"}
                    </button>
                    <button onClick={() => setEditId(null)} style={cancelBtn}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#1e293b" }}>{d.name}</span>
                    <button
                      onClick={() => { setEditId(d.id); setEditName(d.name); setError(""); }}
                      style={{ background: "none", border: "1px solid #e2e8f0", color: "#64748b", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => remove(d)}
                      style={{ background: "none", border: "1px solid #fecaca", color: "#dc2626", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const lbl:       React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 };
const inp:       React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13, background: "#fff", boxSizing: "border-box" };
const overlay:   React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 };
const modal:     React.CSSProperties = { background: "#fff", borderRadius: 14, padding: "24px 28px", width: "100%", maxWidth: 460, boxShadow: "0 24px 64px rgba(0,0,0,0.25)" };
const iconBtn:   React.CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4, display: "flex" };
const cancelBtn: React.CSSProperties = { background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const actionBtn: React.CSSProperties = { background: "#2563eb", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700 };
