"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import FileIcon from "@/components/FileIcon";

// ─── Types ────────────────────────────────────────────────────────────────────

type Industry = string;
type Plan = "BASIC" | "PRO" | "ENTERPRISE";
type BillingMode = "FREE" | "CHARGED";
type Step = 1 | 2 | 3 | 4;

interface WizardData {
  name: string;
  industry: Industry;
  billingMode: BillingMode;
  plan: Plan;
  maxUsers: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoPreview: string; // base64 data URL (also stored as logoUrl)
  adminName: string;
  adminEmail: string;
  adminPassword: string; // only used when billingMode = FREE
  paymentLink: string;   // only used when billingMode = CHARGED
}

interface CreationResult {
  companyName: string;
  billingMode: BillingMode;
  adminEmail: string;
  adminPassword: string; // "" when CHARGED
  paymentLink: string;   // "" when FREE
  emailSent: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isStrongEnough(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

function generateStrongPassword(length = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let pw = pick(upper) + pick(lower) + pick(digits);
  for (let i = pw.length; i < length; i++) pw += pick(all);
  return pw.split("").sort(() => Math.random() - 0.5).join("");
}

const FONTS = ["Inter", "Roboto", "Lato", "Montserrat", "Merriweather", "Playfair Display"];

const PLANS: { value: Plan; label: string; maxUsers: number }[] = [
  { value: "BASIC",      label: "Basic",      maxUsers: 10 },
  { value: "PRO",        label: "Pro",        maxUsers: 30 },
  { value: "ENTERPRISE", label: "Enterprise", maxUsers: 50 },
];

const DEFAULTS: WizardData = {
  name: "", industry: "", billingMode: "FREE", plan: "BASIC", maxUsers: 10,
  primaryColor: "#2563eb", secondaryColor: "#1e40af", accentColor: "#7c3aed",
  fontFamily: "Inter", logoPreview: "", adminName: "", adminEmail: "", adminPassword: "", paymentLink: "",
};

function isValidUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === "http:" || u.protocol === "https:"; }
  catch { return false; }
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, onGoTo }: { current: Step; onGoTo: (s: Step) => void }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "Información" }, { n: 2, label: "Marca" },
    { n: 3, label: "Admin" }, { n: 4, label: "Revisión" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
      {steps.map(({ n, label }, i) => (
        <div key={n} style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <div
            onClick={() => n < current ? onGoTo(n) : undefined}
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: n < current ? "pointer" : "default" }}
          >
            <div style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              background: n < current ? "#16a34a" : n === current ? "#2563eb" : "#e2e8f0",
              color: n <= current ? "#fff" : "#9ca3af",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700,
            }}>
              {n}
            </div>
            <span style={{ fontSize: 13, fontWeight: n === current ? 700 : 400, color: n === current ? "#1e293b" : n < current ? "#16a34a" : "#94a3b8", whiteSpace: "nowrap" }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, background: n < current ? "#bbf7d0" : "#e2e8f0", margin: "0 10px" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Live branding preview ────────────────────────────────────────────────────

function BrandingPreview({ d }: { d: WizardData }) {
  const name = d.name.trim() || "Company Name";
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 10px" }}>
        Vista previa
      </p>
      <div style={{ border: "2px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#f8fafc", fontSize: 13 }}>
        {/* Header */}
        <div style={{ background: d.primaryColor, color: "#fff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {d.logoPreview && (
              <img src={d.logoPreview} alt="" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 3, background: "#fff" }} />
            )}
            <strong style={{ fontFamily: d.fontFamily }}>{name} · KE-Control</strong>
          </div>
          <span style={{ fontSize: 11, opacity: 0.75 }}>COMPANY_ADMIN</span>
        </div>

        {/* Breadcrumb */}
        <div style={{ background: "#fff", padding: "6px 16px", borderBottom: "1px solid #f1f5f9" }}>
          <span style={{ color: d.primaryColor, fontWeight: 600, fontSize: 12 }}>Home</span>
        </div>

        {/* Action bar */}
        <div style={{ padding: "12px 16px 8px", display: "flex", gap: 8 }}>
          <span style={{ background: d.primaryColor, color: "#fff", padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>+ New Folder</span>
          <span style={{ background: d.secondaryColor, color: "#fff", padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>↑ Upload</span>
        </div>

        {/* Simulated rows */}
        <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {["Contracts", "Reports", "Templates"].map((f) => (
            <div key={f} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <FileIcon isFolder size={16} />
              <span style={{ fontWeight: 600, color: d.secondaryColor, fontFamily: d.fontFamily }}>{f}</span>
            </div>
          ))}
        </div>

        {/* Accent sample */}
        <div style={{ padding: "0 16px 14px" }}>
          <span style={{ background: d.accentColor, color: "#fff", padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
            Accent: {d.accentColor}
          </span>
        </div>
      </div>

      {/* Font sample */}
      <p style={{ marginTop: 14, fontSize: 12, color: "#64748b" }}>
        Fuente: <span style={{ fontFamily: d.fontFamily, fontWeight: 600 }}>{d.fontFamily} — Aa Bb Cc 123</span>
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CompanyWizard() {
  const router = useRouter();
  const logoRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<WizardData>(DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<CreationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [showPw, setShowPw] = useState(false);
  const [industries, setIndustries] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/superadmin/industries")
      .then((r) => r.json())
      .then((d) => {
        const list = d.industries ?? [];
        setIndustries(list);
        if (list.length > 0) set("industry", list[0].name);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof WizardData>(key: K, val: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: val }));
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert("Logo must be under 500 KB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => set("logoPreview", (ev.target?.result as string) ?? "");
    reader.readAsDataURL(file);
  }

  function canAdvance(): boolean {
    if (step === 1) return data.name.trim().length > 0 && data.industry.trim().length > 0;
    if (step === 2) return true;
    if (step === 3) {
      const contactOk = data.adminName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.adminEmail);
      if (data.billingMode === "CHARGED") return contactOk && isValidUrl(data.paymentLink);
      return contactOk && isStrongEnough(data.adminPassword);
    }
    return true;
  }

  async function handleCreate() {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/superadmin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name, industry: data.industry, plan: data.plan,
          primaryColor: data.primaryColor, secondaryColor: data.secondaryColor,
          accentColor: data.accentColor, fontFamily: data.fontFamily,
          logoUrl: data.logoPreview || undefined,
          adminName: data.adminName, adminEmail: data.adminEmail,
          billingMode: data.billingMode,
          ...(data.billingMode === "CHARGED"
            ? { paymentLink: data.paymentLink }
            : { adminPassword: data.adminPassword }),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Failed to create company");
        if (json.field === "adminPassword" || json.field === "paymentLink") setStep(3);
        return;
      }
      setResult({
        companyName: data.name,
        billingMode: data.billingMode,
        adminEmail: data.adminEmail,
        adminPassword: data.billingMode === "FREE" ? data.adminPassword : "",
        paymentLink: data.billingMode === "CHARGED" ? data.paymentLink : "",
        emailSent: json.emailSent,
      });
    } catch {
      setServerError("Error de red — intenta de nuevo");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    if (!result) return;
    await navigator.clipboard.writeText(result.billingMode === "CHARGED" ? result.paymentLink : result.adminPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (result) {
    const isCharged = result.billingMode === "CHARGED";
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: 24, color: "#1e293b", margin: "0 0 8px" }}>
          {isCharged ? `${result.companyName} — pendiente de pago` : `¡${result.companyName} está activa!`}
        </h2>
        <p style={{ color: "#64748b", marginBottom: 28 }}>
          {isCharged ? "Contacto" : "Administrador"}: <strong>{result.adminEmail}</strong>
        </p>

        {isCharged ? (
          <>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "18px 20px", marginBottom: 20, textAlign: "left" }}>
              <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#92400e", fontSize: 14 }}>
                Link de pago enviado — sin credenciales todavía
              </p>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "#78350f" }}>
                Cuando el cliente pague, ve al detalle de esta empresa en el panel y confirma el pago para generar y enviar las credenciales.
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code style={{ flex: 1, background: "#fff", border: "1px solid #fde68a", padding: "10px 14px", borderRadius: 6, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {result.paymentLink}
                </code>
                <button onClick={copyPassword} style={{ background: "#d97706", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
            <div style={{ background: result.emailSent ? "#f0fdf4" : "#fff7ed", border: `1px solid ${result.emailSent ? "#bbf7d0" : "#fed7aa"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 28, fontSize: 13, color: result.emailSent ? "#166534" : "#9a3412" }}>
              {result.emailSent
                ? `Correo con el link de pago enviado a ${result.adminEmail}`
                : `Correo no enviado (configura RESEND_API_KEY) — comparte el link manualmente`}
            </div>
          </>
        ) : (
          <>
            <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: "18px 20px", marginBottom: 20, textAlign: "left" }}>
              <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#92400e", fontSize: 14 }}>
                Contraseña asignada — guárdala, no volverá a mostrarse
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code style={{ flex: 1, background: "#fff", border: "1px solid #fcd34d", padding: "10px 14px", borderRadius: 6, fontSize: 16, letterSpacing: 2, fontFamily: "monospace" }}>
                  {result.adminPassword}
                </code>
                <button onClick={copyPassword} style={{ background: "#d97706", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
            <div style={{ background: result.emailSent ? "#f0fdf4" : "#fff7ed", border: `1px solid ${result.emailSent ? "#bbf7d0" : "#fed7aa"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 28, fontSize: 13, color: result.emailSent ? "#166534" : "#9a3412" }}>
              {result.emailSent
                ? `Correo de bienvenida enviado a ${result.adminEmail}`
                : `Correo no enviado (configura RESEND_API_KEY) — comparte la contraseña manualmente`}
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={() => { setResult(null); setData({ ...DEFAULTS, industry: industries[0]?.name ?? "" }); setStep(1); }} style={s.btn("#64748b")}>
            Crear otra empresa
          </button>
          <button onClick={() => router.push("/superadmin")} style={s.btn("#2563eb")}>
            Panel →
          </button>
        </div>
      </div>
    );
  }

  // ── Wizard layout ───────────────────────────────────────────────────────────

  return (
    <div>
      <StepIndicator current={step} onGoTo={(n) => setStep(n)} />

      {serverError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 20, color: "#dc2626", fontSize: 14 }}>
          {serverError}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 36 }}>

        {/* ── Left: form ── */}
        <div>

          {/* Paso 1 — Información de la empresa */}
          {step === 1 && (
            <div style={s.section}>
              <h3 style={s.title}>Información de la empresa</h3>

              <label style={s.label}>
                Nombre de la empresa *
                <input style={s.input} value={data.name} placeholder="Empresa S.A." onChange={(e) => set("name", e.target.value)} />
              </label>

              <label style={s.label}>
                Industria *
                <select style={s.select} value={data.industry} onChange={(e) => set("industry", e.target.value)}>
                  {industries.length === 0 && <option value="">— Sin industrias definidas —</option>}
                  {industries.map(({ id, name }) => <option key={id} value={name}>{name}</option>)}
                </select>
                {industries.length === 0 && (
                  <span style={s.hint}>
                    No hay industrias creadas. Ve a <a href="/superadmin/industries">Industrias</a> para agregar una.
                  </span>
                )}
              </label>

              <div>
                <p style={{ ...s.label, display: "block" as const, marginBottom: 8 }}>¿Se le va a cobrar a esta empresa? *</p>
                <div style={{ display: "flex", gap: 10 }}>
                  {([
                    { value: "CHARGED" as const, label: "Sí, se cobra", desc: "Se envía un link de pago; las credenciales se generan al confirmar el pago." },
                    { value: "FREE" as const, label: "No, es gratuita", desc: "Se envían las credenciales de inmediato con el plan elegido abajo." },
                  ]).map(({ value, label, desc }) => (
                    <label key={value} style={{
                      flex: 1, display: "flex", flexDirection: "column", gap: 4,
                      padding: "10px 14px", border: `2px solid ${data.billingMode === value ? "#2563eb" : "#e2e8f0"}`,
                      borderRadius: 8, cursor: "pointer",
                      background: data.billingMode === value ? "#eff6ff" : "#fff",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="radio" checked={data.billingMode === value} onChange={() => set("billingMode", value)} style={{ accentColor: "#2563eb" }} />
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
                      </span>
                      <span style={{ fontSize: 11, color: "#64748b", paddingLeft: 22 }}>{desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p style={{ ...s.label, display: "block" as const, marginBottom: 8 }}>Plan *</p>
                {PLANS.map(({ value, label, maxUsers }) => (
                  <label key={value} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", border: `2px solid ${data.plan === value ? "#2563eb" : "#e2e8f0"}`,
                    borderRadius: 8, marginBottom: 6, cursor: "pointer",
                    background: data.plan === value ? "#eff6ff" : "#fff",
                  }}>
                    <input
                      type="radio"
                      checked={data.plan === value}
                      onChange={() => setData((prev) => ({ ...prev, plan: value, maxUsers }))}
                      style={{ accentColor: "#2563eb" }}
                    />
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
                      <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>
                        {value === "BASIC" && "— hasta 10 usuarios / 5 GB"}
                        {value === "PRO" && "— hasta 30 usuarios / 15 GB"}
                        {value === "ENTERPRISE" && "— hasta 50 usuarios / 30 GB"}
                      </span>
                    </div>
                  </label>
                ))}
                <p style={{ ...s.hint, marginTop: 4 }}>
                  El límite de usuarios lo define el plan y no puede modificarse manualmente.
                  Actualmente: <strong>{data.maxUsers} usuarios</strong>
                </p>
              </div>
            </div>
          )}

          {/* Paso 2 — Marca */}
          {step === 2 && (
            <div style={s.section}>
              <h3 style={s.title}>Marca y apariencia</h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {([
                  ["primaryColor", "Color primario"],
                  ["secondaryColor", "Color secundario"],
                  ["accentColor", "Color de acento"],
                ] as const).map(([key, label]) => (
                  <label key={key} style={s.label}>
                    {label}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                      <input
                        type="color"
                        value={data[key]}
                        onChange={(e) => set(key, e.target.value)}
                        style={{ width: 42, height: 36, border: "1px solid #d1d5db", borderRadius: 6, padding: 2, cursor: "pointer", flexShrink: 0 }}
                      />
                      <input
                        style={{ ...s.input, marginTop: 0, flex: 1 }}
                        value={data[key]}
                        onChange={(e) => set(key, e.target.value)}
                        maxLength={7}
                      />
                    </div>
                  </label>
                ))}

                <label style={s.label}>
                  Fuente tipográfica
                  <select style={{ ...s.select, marginTop: 4 }} value={data.fontFamily} onChange={(e) => set("fontFamily", e.target.value)}>
                    {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ ...s.label, marginTop: 8 }}>
                Logo <span style={s.hint}>(opcional · PNG/SVG/JPG · máx. 500 KB)</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                  {data.logoPreview && (
                    <img src={data.logoPreview} alt="logo" style={{ width: 48, height: 48, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", padding: 4 }} />
                  )}
                  <button type="button" onClick={() => logoRef.current?.click()} style={s.btn("#64748b", true)}>
                    {data.logoPreview ? "Cambiar" : "Subir logo"}
                  </button>
                  {data.logoPreview && (
                    <button type="button" onClick={() => { set("logoPreview", ""); if (logoRef.current) logoRef.current.value = ""; }} style={{ ...s.btn("#dc2626", true), background: "transparent", color: "#dc2626", border: "1px solid #fecaca" }}>
                      Quitar
                    </button>
                  )}
                </div>
                <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoChange} />
              </label>
            </div>
          )}

          {/* Paso 3 — Administrador */}
          {step === 3 && (
            <div style={s.section}>
              <h3 style={s.title}>Administrador de la empresa</h3>
              <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>
                {data.billingMode === "CHARGED"
                  ? "Esta persona será el COMPANY_ADMIN una vez se confirme el pago."
                  : "Esta persona será el COMPANY_ADMIN inicial. Se generará una contraseña temporal segura y se le enviará por correo."}
              </p>

              <label style={s.label}>
                Nombre completo *
                <input style={s.input} value={data.adminName} placeholder="María López" onChange={(e) => set("adminName", e.target.value)} />
              </label>

              <label style={s.label}>
                Correo electrónico *
                <input type="email" style={s.input} value={data.adminEmail} placeholder="admin@empresa.com" onChange={(e) => set("adminEmail", e.target.value)} />
              </label>

              {data.billingMode === "CHARGED" ? (
                <>
                  <label style={s.label}>
                    Link de pago * <span style={s.hint}>(generado en el dashboard de Tilopay u otra pasarela)</span>
                    <input
                      type="url"
                      style={s.input}
                      value={data.paymentLink}
                      placeholder="https://tilopay.com/pago/xxxxx"
                      onChange={(e) => set("paymentLink", e.target.value)}
                    />
                    {data.paymentLink.length > 0 && !isValidUrl(data.paymentLink) && (
                      <span style={{ ...s.hint, color: "#dc2626" }}>Ingresa una URL válida (https://...)</span>
                    )}
                  </label>

                  <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "14px 16px", fontSize: 13, color: "#92400e", marginTop: 8 }}>
                    <strong>¿Qué ocurre después?</strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      <li>Se crea la empresa, pendiente de pago — sin acceso todavía.</li>
                      <li>Se le envía este link de pago por correo (si RESEND_API_KEY está configurado).</li>
                      <li>Cuando confirme el pago, ve al detalle de la empresa y presiona &quot;Confirmar pago&quot; para generar y enviar las credenciales.</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  <label style={s.label}>
                    Contraseña de acceso * <span style={s.hint}>(mín. 8 caracteres, mayúscula, minúscula y número)</span>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <input
                        type={showPw ? "text" : "password"}
                        style={{ ...s.input, marginTop: 0, flex: 1 }}
                        value={data.adminPassword}
                        placeholder="Contraseña para el administrador"
                        onChange={(e) => set("adminPassword", e.target.value)}
                      />
                      <button type="button" onClick={() => setShowPw((v) => !v)} style={s.btn("#64748b", true)}>
                        {showPw ? "Ocultar" : "Ver"}
                      </button>
                      <button type="button" onClick={() => { set("adminPassword", generateStrongPassword()); setShowPw(true); }} style={s.btn("#2563eb", true)}>
                        Generar
                      </button>
                    </div>
                    {data.adminPassword.length > 0 && !isStrongEnough(data.adminPassword) && (
                      <span style={{ ...s.hint, color: "#dc2626" }}>La contraseña no cumple los requisitos mínimos</span>
                    )}
                  </label>

                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 16px", fontSize: 13, color: "#166534", marginTop: 8 }}>
                    <strong>¿Qué ocurre después?</strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      <li>Se crea el usuario con la contraseña que definiste arriba.</li>
                      <li>Se envía un correo de bienvenida con esas credenciales (si RESEND_API_KEY está configurado).</li>
                      <li>El administrador puede cambiarla luego desde su propio panel.</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Paso 4 — Revisión */}
          {step === 4 && (
            <div style={s.section}>
              <h3 style={s.title}>Revisar y crear</h3>

              <div style={s.card}>
                <p style={s.cardHead}>Empresa</p>
                <div style={s.row}><span style={s.rowLabel}>Nombre</span><strong>{data.name}</strong></div>
                <div style={s.row}><span style={s.rowLabel}>Industria</span><span>{data.industry}</span></div>
                <div style={s.row}>
                  <span style={s.rowLabel}>Facturación</span>
                  <span>{data.billingMode === "CHARGED" ? "Se cobra — pendiente de pago" : "Gratuita — acceso inmediato"}</span>
                </div>
                <div style={s.row}>
                  <span style={s.rowLabel}>Plan</span>
                  <span>{PLANS.find(p => p.value === data.plan)?.label} — hasta {data.maxUsers} usuarios</span>
                </div>
              </div>

              <div style={s.card}>
                <p style={s.cardHead}>Marca</p>
                <div style={s.row}>
                  <span style={s.rowLabel}>Colores</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[data.primaryColor, data.secondaryColor, data.accentColor].map((c) => (
                      <div key={c} title={c} style={{ width: 20, height: 20, borderRadius: 4, background: c, border: "1px solid #e2e8f0" }} />
                    ))}
                  </div>
                </div>
                <div style={s.row}><span style={s.rowLabel}>Fuente</span><span style={{ fontFamily: data.fontFamily }}>{data.fontFamily}</span></div>
                {data.logoPreview && (
                  <div style={s.row}><span style={s.rowLabel}>Logo</span><img src={data.logoPreview} alt="logo" style={{ height: 24, width: 24, objectFit: "contain" }} /></div>
                )}
              </div>

              <div style={s.card}>
                <p style={s.cardHead}>{data.billingMode === "CHARGED" ? "Administrador propuesto" : "Administrador"}</p>
                <div style={s.row}><span style={s.rowLabel}>Nombre</span><span>{data.adminName}</span></div>
                <div style={s.row}><span style={s.rowLabel}>Correo</span><span>{data.adminEmail}</span></div>
                {data.billingMode === "CHARGED" ? (
                  <div style={s.row}><span style={s.rowLabel}>Link de pago</span><span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{data.paymentLink}</span></div>
                ) : (
                  <div style={s.row}><span style={s.rowLabel}>Contraseña</span><code>{"•".repeat(Math.min(data.adminPassword.length, 16))}</code></div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* ── Right: live preview ── */}
        <div style={{ alignSelf: "start", position: "sticky", top: 24 }}>
          <BrandingPreview d={data} />
        </div>

      </div>

      {/* ── Navigation ── */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
        <button
          onClick={() => step > 1 ? setStep((step - 1) as Step) : router.push("/superadmin")}
          style={s.btn("#64748b")}
        >
          ← {step === 1 ? "Cancelar" : "Atrás"}
        </button>

        {step < 4 ? (
          <button
            disabled={!canAdvance()}
            onClick={() => setStep((step + 1) as Step)}
            style={{ ...s.btn("#2563eb"), opacity: canAdvance() ? 1 : 0.4, cursor: canAdvance() ? "pointer" : "not-allowed" }}
          >
            Siguiente →
          </button>
        ) : (
          <button
            disabled={submitting}
            onClick={handleCreate}
            style={{ ...s.btn("#16a34a"), opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? "Creando…" : "Crear empresa"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const s = {
  btn: (bg: string, small = false): React.CSSProperties => ({
    background: bg, color: "#fff", border: "none",
    padding: small ? "7px 14px" : "10px 22px",
    borderRadius: 8, cursor: "pointer", fontWeight: 700,
    fontSize: small ? 12 : 14,
  }),
  section: { display: "flex", flexDirection: "column" as const, gap: 18 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, color: "#1e293b", margin: 0 } as React.CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "#374151", display: "flex", flexDirection: "column" as const, gap: 4 } as React.CSSProperties,
  hint: { fontSize: 11, fontWeight: 400, color: "#94a3b8" } as React.CSSProperties,
  input: { padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 14, outline: "none", marginTop: 2 } as React.CSSProperties,
  select: { padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 14, background: "#fff", cursor: "pointer" } as React.CSSProperties,
  card: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 16px", display: "flex", flexDirection: "column" as const, gap: 8 } as React.CSSProperties,
  cardHead: { margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: 1 } as React.CSSProperties,
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 } as React.CSSProperties,
  rowLabel: { color: "#64748b" } as React.CSSProperties,
};
