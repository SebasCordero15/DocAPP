"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Pencil, X, Trash2, KeyRound, ImagePlus, ArchiveRestore } from "lucide-react";

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
  deletedAt: string | null;
  maxUsers: number;
  maxStorageMB: number;
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

function formatMB(mb: number): string {
  if (mb < 1024) return `${mb} MB`;
  return `${(mb / 1024).toFixed(0)} GB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const PLAN_COLORS: Record<string, { bg: string; fg: string }> = {
  BASIC:      { bg: "#f3f4f6", fg: "#374151" },
  PRO:        { bg: "#dbeafe", fg: "#1d4ed8" },
  ENTERPRISE: { bg: "#ede9fe", fg: "#6d28d9" },
};

const PLAN_LIMITS: Record<string, { maxUsers: number; maxStorageMB: number }> = {
  BASIC:      { maxUsers: 10,  maxStorageMB: 5120  },
  PRO:        { maxUsers: 50,  maxStorageMB: 15360 },
  ENTERPRISE: { maxUsers: 250, maxStorageMB: 30720 },
};

const ROLE_COLORS: Record<string, { bg: string; fg: string }> = {
  COMPANY_ADMIN: { bg: "#fef3c7", fg: "#92400e" },
  ADMIN:         { bg: "#fef3c7", fg: "#92400e" },
  EDITOR:        { bg: "#e0f2fe", fg: "#0369a1" },
  VIEWER:        { bg: "#f3f4f6", fg: "#374151" },
};

const ROLE_LABELS: Record<string, string> = {
  COMPANY_ADMIN: "Admin", ADMIN: "Admin",
  EDITOR: "Editor", VIEWER: "Lector",
};

const INDUSTRY_LABELS: Record<string, string> = {
  FARMACIA: "Farmacia", ALIMENTOS: "Alimentos", MATERIALES: "Materiales",
  SERVICIOS: "Servicios", OTRO: "Otro",
  LEGAL: "Otro", FINANCE: "Otro", HEALTHCARE: "Otro",
  REAL_ESTATE: "Otro", TECH: "Otro", OTHER: "Otro",
};

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
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
      style={{ display: "flex", alignItems: "center", gap: 5, background: copied ? "#f0fdf4" : "#fff", color: copied ? "#16a34a" : "#374151", border: `1px solid ${copied ? "#bbf7d0" : "#d1d5db"}`, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "¡Copiado!" : label}
    </button>
  );
}

// ─── PasswordResetModal ────────────────────────────────────────────────────────

interface ResetPasswordResult {
  tempPassword: string;
  userName: string;
  userEmail: string;
}

function PasswordResetModal({
  companyId,
  user,
  onClose,
}: {
  companyId: string;
  user: CompanyUser;
  onClose: () => void;
}) {
  const [useCustom, setUseCustom] = useState(false);
  const [customPw, setCustomPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetPasswordResult | null>(null);

  async function doReset() {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/superadmin/companies/${companyId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, ...(useCustom && customPw ? { customPassword: customPw } : {}) }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Error al restablecer contraseña");
    } else {
      setResult(d);
    }
    setSaving(false);
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <KeyRound size={20} color="#d97706" />
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Restablecer contraseña</h3>
          </div>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        {!result ? (
          <>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>
              Restableciendo contraseña de <strong>{user.name}</strong> ({user.email}).
              La contraseña temporal se mostrará <strong>una sola vez</strong>.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
                Especificar contraseña manualmente
              </label>
            </div>

            {useCustom && (
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Contraseña temporal</label>
                <input
                  type="text"
                  value={customPw}
                  onChange={(e) => setCustomPw(e.target.value)}
                  placeholder="Mín. 8 caracteres, mayúscula, minúscula y número"
                  style={inp}
                />
                <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>
                  Mín. 8 · mayúscula · minúscula · número
                </p>
              </div>
            )}

            {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={cancelBtn}>Cancelar</button>
              <button
                onClick={doReset}
                disabled={saving || (useCustom && !customPw)}
                style={{ ...actionBtn, background: "#d97706", opacity: (saving || (useCustom && !customPw)) ? 0.6 : 1 }}
              >
                {saving ? "Restableciendo…" : "Restablecer contraseña"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "16px 18px", marginBottom: 20 }}>
              <p style={{ margin: "0 0 6px", color: "#92400e", fontWeight: 700, fontSize: 13 }}>
                ✓ Contraseña restablecida para {result.userName}
              </p>
              <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: 12 }}>
                Esta contraseña temporal se muestra <strong>una sola vez</strong>. Compártela de forma segura con el usuario.
                El usuario deberá cambiarla al iniciar sesión.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, background: "#fff", border: "1px solid #fed7aa", borderRadius: 7, padding: "10px 14px", fontSize: 16, fontWeight: 700, letterSpacing: 2, color: "#1e293b" }}>
                  {result.tempPassword}
                </code>
                <CopyButton text={result.tempPassword} label="Copiar" />
              </div>
            </div>
            <button onClick={onClose} style={{ ...actionBtn, background: "#1B3A6B" }}>Cerrar</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── DeleteModal ──────────────────────────────────────────────────────────────

function DeleteModal({
  company,
  onClose,
}: {
  company: CompanyData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatches = confirmName === company.name;

  async function doDelete() {
    setError(null);
    setDeleting(true);
    const res = await fetch(`/api/superadmin/companies/${company.id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Error al archivar la empresa");
    } else {
      router.push("/superadmin");
    }
    setDeleting(false);
  }

  return (
    <div style={overlay}>
      <div style={{ ...modal, maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Trash2 size={20} color="#dc2626" />
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#dc2626" }}>Archivar empresa</h3>
          </div>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#dc2626" }}>⚠️ La empresa quedará inaccesible</p>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#7f1d1d" }}>
            <strong>{company.name}</strong> será archivada: todos sus usuarios perderán acceso de inmediato.
            Los datos se conservan y la empresa puede restaurarse desde este panel.
          </p>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: "#7f1d1d" }}>
            <li>Usuarios bloqueados: {company.users.length}</li>
            <li>Archivos preservados: {company.fileCount}</li>
            <li>Datos, carpetas y permisos intactos</li>
          </ul>
        </div>

        <label style={lbl}>Para confirmar, escribe el nombre exacto de la empresa:</label>
        <input
          type="text"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={company.name}
          style={{ ...inp, border: `1px solid ${nameMatches && confirmName ? "#16a34a" : "#d1d5db"}` }}
        />
        {confirmName && !nameMatches && (
          <p style={{ fontSize: 12, color: "#dc2626", margin: "4px 0 0" }}>El nombre no coincide</p>
        )}

        {error && (
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "10px 12px", marginTop: 12 }}>
            <p style={{ color: "#92400e", fontSize: 13, margin: 0 }}>{error}</p>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={cancelBtn}>Cancelar</button>
          <button
            onClick={doDelete}
            disabled={!nameMatches || deleting}
            style={{ ...actionBtn, background: "#dc2626", opacity: (!nameMatches || deleting) ? 0.5 : 1 }}
          >
            {deleting ? "Archivando…" : "Archivar empresa"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EditCompanyModal ──────────────────────────────────────────────────────────

function EditCompanyModal({
  company,
  onSave,
  onClose,
}: {
  company: CompanyData;
  onSave: (updated: Partial<CompanyData>) => void;
  onClose: () => void;
}) {
  const [name,           setName]           = useState(company.name);
  const [industry,       setIndustry]       = useState(company.industry);
  const [plan,           setPlan]           = useState(company.plan);
  const [customDomain,   setCustomDomain]   = useState(company.customDomain ?? "");
  const [primaryColor,   setPrimaryColor]   = useState(company.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(company.secondaryColor);
  const [accentColor,    setAccentColor]    = useState(company.accentColor);
  const [fontFamily,     setFontFamily]     = useState(company.fontFamily);
  const [logoUrl,        setLogoUrl]        = useState(company.logoUrl);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      setError("El logo no puede superar 500 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setLogoUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function save() {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/superadmin/companies/${company.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, industry,
        plan: plan !== company.plan ? plan : undefined,
        customDomain: customDomain || null,
        primaryColor, secondaryColor, accentColor, fontFamily,
        logoUrl,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Error al guardar");
    } else {
      const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.BASIC;
      onSave({
        name, industry, plan,
        maxUsers: limits.maxUsers,
        maxStorageMB: limits.maxStorageMB,
        customDomain: customDomain || null,
        primaryColor, secondaryColor, accentColor, fontFamily,
        logoUrl,
        ...d.company,
      });
      onClose();
    }
    setSaving(false);
  }

  return (
    <div style={overlay}>
      <div style={{ ...modal, maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Pencil size={18} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Editar empresa</h3>
          </div>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        {/* Logo section */}
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Logo</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {logoUrl ? (
              <img src={logoUrl} alt="logo" style={{ width: 56, height: 56, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, background: "#fff" }} />
            ) : (
              <div style={{ width: 56, height: 56, background: "#f1f5f9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #cbd5e1" }}>
                <ImagePlus size={22} color="#94a3b8" />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...cancelBtn, fontSize: 12 }}>
                {logoUrl ? "Cambiar logo" : "Subir logo"}
              </button>
              {logoUrl && (
                <button type="button" onClick={() => setLogoUrl(null)} style={{ ...cancelBtn, fontSize: 12, color: "#dc2626", borderColor: "#fecaca" }}>
                  Eliminar logo
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoFile} style={{ display: "none" }} />
          </div>
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "5px 0 0" }}>PNG, JPG o SVG · máx. 500 KB</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Nombre de la empresa *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inp} />
          </div>

          <div>
            <label style={lbl}>Industria</label>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={inp}>
              <option value="FARMACIA">Farmacia</option>
              <option value="ALIMENTOS">Alimentos</option>
              <option value="MATERIALES">Materiales</option>
              <option value="SERVICIOS">Servicios</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>

          <div>
            <label style={lbl}>Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} style={inp}>
              <option value="BASIC">Basic — 10 usuarios / 5 GB</option>
              <option value="PRO">Pro — 50 usuarios / 15 GB</option>
              <option value="ENTERPRISE">Enterprise — 250 usuarios / 30 GB</option>
            </select>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Dominio personalizado (opcional)</label>
            <input type="text" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="app.miempresa.com" style={inp} />
          </div>

          {/* Branding */}
          <div style={{ gridColumn: "span 2", borderTop: "1px solid #f1f5f9", paddingTop: 14, marginTop: 4 }}>
            <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>Branding</p>
          </div>

          <div>
            <label style={lbl}>Color primario</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ width: 36, height: 36, border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", padding: 2 }} />
              <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ ...inp, flex: 1, fontFamily: "monospace" }} />
            </div>
          </div>

          <div>
            <label style={lbl}>Color secundario</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} style={{ width: 36, height: 36, border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", padding: 2 }} />
              <input type="text" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} style={{ ...inp, flex: 1, fontFamily: "monospace" }} />
            </div>
          </div>

          <div>
            <label style={lbl}>Color de acento</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ width: 36, height: 36, border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", padding: 2 }} />
              <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ ...inp, flex: 1, fontFamily: "monospace" }} />
            </div>
          </div>

          <div>
            <label style={lbl}>Familia tipográfica</label>
            <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} style={inp}>
              <option value="Inter">Inter</option>
              <option value="Roboto">Roboto</option>
              <option value="Open Sans">Open Sans</option>
              <option value="Montserrat">Montserrat</option>
              <option value="Poppins">Poppins</option>
              <option value="Lato">Lato</option>
            </select>
          </div>
        </div>

        {/* Branding preview */}
        <div style={{ marginTop: 16, background: "#f8fafc", borderRadius: 8, padding: "12px 14px", border: "1px solid #e2e8f0" }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>Vista previa</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: primaryColor }} />
            <div style={{ width: 28, height: 28, borderRadius: 6, background: secondaryColor }} />
            <div style={{ width: 28, height: 28, borderRadius: 6, background: accentColor }} />
            <span style={{ fontSize: 14, fontFamily: fontFamily, color: "#1e293b", marginLeft: 4 }}>{name || "Empresa"}</span>
          </div>
        </div>

        {error && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 14 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onClose} style={cancelBtn}>Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim()} style={{ ...actionBtn, opacity: (saving || !name.trim()) ? 0.6 : 1 }}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CompanyDetail({ company: initial, auditLogs }: Props) {
  const router = useRouter();
  const [company,    setCompany]    = useState(initial);
  const [toggling,      setToggling]      = useState(false);
  const [toggleError,   setToggleError]   = useState<string | null>(null);
  const [restoring,     setRestoring]     = useState(false);
  const [activeTab,  setActiveTab]  = useState<"users" | "audit">("users");
  const [showEdit,   setShowEdit]   = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [resetTarget, setResetTarget] = useState<CompanyUser | null>(null);

  async function restoreCompany() {
    setRestoring(true);
    setToggleError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${company.id}/delete`, {
        method: "DELETE",
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setCompany((prev) => ({ ...prev, deletedAt: null, isActive: true }));
      } else {
        setToggleError(d.error ?? "Error al restaurar la empresa");
      }
    } catch {
      setToggleError("Error de conexión");
    } finally {
      setRestoring(false);
    }
  }

  const activeUserCount = company.users.filter((u) => u.isActive).length;
  const usedStorageMB   = company.storageBytes / (1024 * 1024);
  const pc = PLAN_COLORS[company.plan] ?? PLAN_COLORS.BASIC;

  const lastAccessIso = company.users
    .map((u) => u.lastLoginAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  const activeUsers30d = company.users.filter((u) => {
    if (!u.lastLoginAt) return false;
    return Date.now() - new Date(u.lastLoginAt).getTime() <= 30 * 24 * 60 * 60 * 1000;
  }).length;

  async function toggleActive() {
    setToggling(true);
    setToggleError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !company.isActive }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setCompany((prev) => ({ ...prev, isActive: !prev.isActive }));
      } else {
        setToggleError(d.error ?? "Error al cambiar estado");
      }
    } catch {
      setToggleError("Error de conexión");
    } finally {
      setToggling(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      {/* ── Header ── */}
      <header style={{ background: "#1e293b", color: "#fff", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: 17 }}>KE-Control Admin</strong>
          <span style={{ fontSize: 12, background: "#334155", padding: "2px 8px", borderRadius: 4, marginLeft: 10, color: "#94a3b8" }}>
            SUPER_ADMIN
          </span>
        </div>
        <a href="/superadmin" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>← Panel</a>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 28px" }}>
        {/* ── Archived banner ── */}
        {company.deletedAt && (
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "14px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#92400e" }}>
                Empresa archivada
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#b45309" }}>
                Archivada el {new Date(company.deletedAt).toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" })}. Los datos se conservan intactos.
              </p>
            </div>
            <button
              onClick={restoreCompany}
              disabled={restoring}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#16a34a", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: restoring ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, opacity: restoring ? 0.6 : 1 }}
            >
              <ArchiveRestore size={14} /> {restoring ? "Restaurando…" : "Restaurar empresa"}
            </button>
          </div>
        )}

        {/* ── Company header card ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "24px 28px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {company.logoUrl ? (
                <img src={company.logoUrl} alt="logo" style={{ width: 52, height: 52, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, background: "#fff" }} />
              ) : (
                <div style={{ width: 52, height: 52, borderRadius: 8, background: company.primaryColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 22 }}>
                  {company.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#1e293b" }}>{company.name}</h1>
                  <span style={{ background: pc.bg, color: pc.fg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{company.plan}</span>
                  <span style={{ color: company.deletedAt ? "#92400e" : company.isActive ? "#16a34a" : "#dc2626", fontWeight: 600, fontSize: 13 }}>
                    {company.deletedAt ? "● Archivada" : company.isActive ? "● Activa" : "● Inactiva"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>
                    <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4 }}>{company.slug}</code>
                  </span>
                  <span style={{ fontSize: 13, color: "#64748b" }}>{INDUSTRY_LABELS[company.industry] ?? company.industry}</span>
                  {company.customDomain && (
                    <span style={{ fontSize: 13, color: "#64748b" }}>{company.customDomain}</span>
                  )}
                </div>
                {/* Branding preview chips */}
                <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                  {[company.primaryColor, company.secondaryColor, company.accentColor].map((c, i) => (
                    <div key={i} title={c} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid rgba(0,0,0,0.1)" }} />
                  ))}
                  <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 2 }}>{company.fontFamily}</span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            {toggleError && (
              <div style={{ width: "100%", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "8px 12px", marginBottom: 8 }}>
                <p style={{ margin: 0, color: "#dc2626", fontSize: 13 }}>{toggleError}</p>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!company.deletedAt && (
                <>
                  <button
                    onClick={() => setShowEdit(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "#1B3A6B", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                  >
                    <Pencil size={14} /> Editar empresa
                  </button>
                  <button
                    disabled={toggling}
                    onClick={toggleActive}
                    style={{
                      background: company.isActive ? "#fef2f2" : "#f0fdf4",
                      color: company.isActive ? "#dc2626" : "#16a34a",
                      border: `1px solid ${company.isActive ? "#fecaca" : "#bbf7d0"}`,
                      padding: "8px 16px", borderRadius: 8, cursor: toggling ? "not-allowed" : "pointer",
                      fontSize: 13, fontWeight: 700, opacity: toggling ? 0.6 : 1,
                    }}
                  >
                    {toggling ? "…" : company.isActive ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    onClick={() => setShowDelete(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                  >
                    <Trash2 size={14} /> Archivar
                  </button>
                </>
              )}
              {company.deletedAt && (
                <button
                  onClick={restoreCompany}
                  disabled={restoring}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "#16a34a", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: restoring ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, opacity: restoring ? 0.6 : 1 }}
                >
                  <ArchiveRestore size={14} /> {restoring ? "Restaurando…" : "Restaurar empresa"}
                </button>
              )}
            </div>
          </div>

          {/* ── Stats row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16, marginTop: 24, paddingTop: 20, borderTop: "1px solid #f1f5f9" }}>
            <div>
              <p style={statLabel}>Usuarios</p>
              <p style={{ ...statVal, color: "#2563eb" }}>{activeUserCount} / {company.maxUsers}</p>
            </div>
            <div>
              <p style={statLabel}>Archivos</p>
              <p style={{ ...statVal, color: "#d97706" }}>{company.fileCount}</p>
            </div>
            <div>
              <p style={statLabel}>Almacenamiento</p>
              <p style={{ ...statVal, color: "#7c3aed", fontSize: 16 }}>
                {formatBytes(company.storageBytes)}
                <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400, marginLeft: 4 }}>/ {formatMB(company.maxStorageMB)}</span>
              </p>
              <div style={{ marginTop: 4, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden", maxWidth: 120 }}>
                <div style={{ height: "100%", width: `${Math.min(100, (usedStorageMB / company.maxStorageMB) * 100).toFixed(1)}%`, background: usedStorageMB / company.maxStorageMB > 0.9 ? "#dc2626" : "#7c3aed", borderRadius: 2 }} />
              </div>
            </div>
            <div>
              <p style={statLabel}>Creada</p>
              <p style={{ ...statVal, fontSize: 14 }}>
                {new Date(company.createdAt).toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </p>
            </div>
            <div>
              <p style={statLabel}>Último acceso</p>
              <p style={{ ...statVal, fontSize: 14, color: lastAccessIso ? "#374151" : "#d1d5db" }}>
                {lastAccessIso ? timeAgo(lastAccessIso) : "Nunca"}
              </p>
            </div>
            <div>
              <p style={statLabel}>Activos 30d</p>
              <p style={{ ...statVal, color: activeUsers30d > 0 ? "#16a34a" : "#94a3b8" }}>{activeUsers30d}</p>
            </div>
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
              {tab === "users" ? `Usuarios (${company.users.length})` : `Actividad (${auditLogs.length})`}
            </button>
          ))}
        </div>

        {/* ── Users tab ── */}
        {activeTab === "users" && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            {company.users.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No hay usuarios.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {["Nombre", "Correo", "Rol", "Estado", "Último acceso", "Registrado", "Acciones"].map((h) => (
                      <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
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
                        <td style={{ padding: "12px 18px", fontWeight: 600, color: u.isActive ? "#1e293b" : "#94a3b8" }}>
                          {u.name}
                          {u.forcePasswordChange && (
                            <span title="Debe cambiar contraseña" style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: 3, marginLeft: 6 }}>TEMP</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 18px", fontSize: 13, color: "#64748b" }}>{u.email}</td>
                        <td style={{ padding: "12px 18px" }}>
                          <span style={{ background: rc.bg, color: rc.fg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                            {ROLE_LABELS[u.role] ?? u.role}
                          </span>
                        </td>
                        <td style={{ padding: "12px 18px" }}>
                          <span style={{ color: u.isActive ? "#16a34a" : "#dc2626", fontSize: 13, fontWeight: 600 }}>
                            {u.isActive ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 18px", fontSize: 13, color: "#64748b" }}>
                          {u.lastLoginAt ? timeAgo(u.lastLoginAt) : <span style={{ color: "#d1d5db" }}>Nunca</span>}
                        </td>
                        <td style={{ padding: "12px 18px", fontSize: 13, color: "#64748b" }}>
                          {new Date(u.createdAt).toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </td>
                        <td style={{ padding: "12px 18px" }}>
                          <button
                            onClick={() => setResetTarget(u)}
                            style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff7ed", color: "#d97706", border: "1px solid #fed7aa", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                          >
                            <KeyRound size={12} /> Restablecer contraseña
                          </button>
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
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Sin registros de actividad.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {["Acción", "Por", "Recurso", "Detalle", "Cuándo"].map((h) => (
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
                        {l.user ? <span title={l.user.email}>{l.user.name}</span> : <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td style={{ padding: "11px 20px", fontSize: 12, color: "#64748b" }}>{l.resourceType ?? "—"}</td>
                      <td style={{ padding: "11px 20px", fontSize: 13, color: "#64748b", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.detail ?? ""}>
                        {l.detail ?? "—"}
                      </td>
                      <td style={{ padding: "11px 20px", fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>{timeAgo(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showEdit && (
        <EditCompanyModal
          company={company}
          onSave={(updated) => setCompany((prev) => ({ ...prev, ...updated }))}
          onClose={() => setShowEdit(false)}
        />
      )}
      {showDelete && (
        <DeleteModal company={company} onClose={() => setShowDelete(false)} />
      )}
      {resetTarget && (
        <PasswordResetModal
          companyId={company.id}
          user={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </main>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const statLabel: React.CSSProperties = { margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 };
const statVal:   React.CSSProperties = { margin: "4px 0 0", fontSize: 20, fontWeight: 700, color: "#374151" };

const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13, background: "#fff", boxSizing: "border-box" };

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 };
const modal:   React.CSSProperties = { background: "#fff", borderRadius: 14, padding: "28px 30px", width: "100%", maxWidth: 480, boxShadow: "0 24px 64px rgba(0,0,0,0.25)" };
const iconBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4, display: "flex" };
const cancelBtn: React.CSSProperties = { background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const actionBtn: React.CSSProperties = { background: "#2563eb", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700 };
