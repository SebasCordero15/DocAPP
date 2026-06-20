"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import FileIcon from "@/components/FileIcon";

// ─── Types ────────────────────────────────────────────────────────────────────

type Industry = "LEGAL" | "FINANCE" | "HEALTHCARE" | "REAL_ESTATE" | "TECH" | "OTHER";
type Plan = "BASIC" | "PRO" | "ENTERPRISE";
type Step = 1 | 2 | 3 | 4;

interface WizardData {
  name: string;
  slug: string;
  industry: Industry;
  plan: Plan;
  maxUsers: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoPreview: string; // base64 data URL (also stored as logoUrl)
  adminName: string;
  adminEmail: string;
}

interface CreationResult {
  companySlug: string;
  companyName: string;
  tempPassword: string;
  emailSent: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

const FONTS = ["Inter", "Roboto", "Lato", "Montserrat", "Merriweather", "Playfair Display"];

const INDUSTRIES: { value: Industry; label: string }[] = [
  { value: "LEGAL", label: "Legal" },
  { value: "FINANCE", label: "Finance" },
  { value: "HEALTHCARE", label: "Healthcare" },
  { value: "REAL_ESTATE", label: "Real Estate" },
  { value: "TECH", label: "Technology" },
  { value: "OTHER", label: "Other" },
];

const PLANS: { value: Plan; label: string; maxUsers: number }[] = [
  { value: "BASIC",      label: "Basic",      maxUsers: 10  },
  { value: "PRO",        label: "Pro",        maxUsers: 50  },
  { value: "ENTERPRISE", label: "Enterprise", maxUsers: 250 },
];

const DEFAULTS: WizardData = {
  name: "", slug: "", industry: "OTHER", plan: "BASIC", maxUsers: 10,
  primaryColor: "#2563eb", secondaryColor: "#1e40af", accentColor: "#7c3aed",
  fontFamily: "Inter", logoPreview: "", adminName: "", adminEmail: "",
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, onGoTo }: { current: Step; onGoTo: (s: Step) => void }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "Info" }, { n: 2, label: "Branding" },
    { n: 3, label: "Admin" }, { n: 4, label: "Review" },
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
        Live Preview
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
        Font: <span style={{ fontFamily: d.fontFamily, fontWeight: 600 }}>{d.fontFamily} — Aa Bb Cc 123</span>
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

  function set<K extends keyof WizardData>(key: K, val: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: val }));
  }

  function handleNameChange(name: string) {
    setData((prev) => ({
      ...prev,
      name,
      // Keep slug in sync while the user hasn't manually edited it
      slug: prev.slug === toSlug(prev.name) ? toSlug(name) : prev.slug,
    }));
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
    if (step === 1) return data.name.trim().length > 0 && /^[a-z0-9-]{2,50}$/.test(data.slug);
    if (step === 2) return true;
    if (step === 3) return data.adminName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.adminEmail);
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
          name: data.name, slug: data.slug, industry: data.industry, plan: data.plan,
          maxUsers: data.maxUsers,
          primaryColor: data.primaryColor, secondaryColor: data.secondaryColor,
          accentColor: data.accentColor, fontFamily: data.fontFamily,
          logoUrl: data.logoPreview || undefined,
          adminName: data.adminName, adminEmail: data.adminEmail,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Failed to create company");
        if (json.field === "slug") setStep(1);
        return;
      }
      setResult({
        companySlug: json.company.slug,
        companyName: data.name,
        tempPassword: json.tempPassword,
        emailSent: json.emailSent,
      });
    } catch {
      setServerError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    if (!result) return;
    await navigator.clipboard.writeText(result.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (result) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: 24, color: "#1e293b", margin: "0 0 8px" }}>{result.companyName} is live!</h2>
        <p style={{ color: "#64748b", marginBottom: 28 }}>
          Company slug: <code style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 4 }}>{result.companySlug}</code>
        </p>

        <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: "18px 20px", marginBottom: 20, textAlign: "left" }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#92400e", fontSize: 14 }}>
            Temporary password — copy now, won't be shown again
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ flex: 1, background: "#fff", border: "1px solid #fcd34d", padding: "10px 14px", borderRadius: 6, fontSize: 16, letterSpacing: 2, fontFamily: "monospace" }}>
              {result.tempPassword}
            </code>
            <button onClick={copyPassword} style={{ background: "#d97706", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div style={{ background: result.emailSent ? "#f0fdf4" : "#fff7ed", border: `1px solid ${result.emailSent ? "#bbf7d0" : "#fed7aa"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 28, fontSize: 13, color: result.emailSent ? "#166534" : "#9a3412" }}>
          {result.emailSent
            ? `Welcome email sent to ${data.adminEmail}`
            : `Email not sent (set RESEND_API_KEY in .env) — share the password manually`}
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={() => { setResult(null); setData(DEFAULTS); setStep(1); }} style={s.btn("#64748b")}>
            Create Another
          </button>
          <button onClick={() => router.push("/superadmin")} style={s.btn("#2563eb")}>
            Dashboard →
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

          {/* Step 1 — Company info */}
          {step === 1 && (
            <div style={s.section}>
              <h3 style={s.title}>Company Information</h3>

              <label style={s.label}>
                Company name *
                <input style={s.input} value={data.name} placeholder="Acme Corp" onChange={(e) => handleNameChange(e.target.value)} />
              </label>

              <label style={s.label}>
                URL slug * <span style={s.hint}>(lowercase letters, numbers, hyphens)</span>
                <input
                  style={s.input}
                  value={data.slug}
                  placeholder="acme-corp"
                  onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                />
                {data.slug && <span style={s.hint}>Login page: /login?company={data.slug}</span>}
              </label>

              <label style={s.label}>
                Industry *
                <select style={s.select} value={data.industry} onChange={(e) => set("industry", e.target.value as Industry)}>
                  {INDUSTRIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

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
                        — up to {maxUsers} users
                      </span>
                    </div>
                  </label>
                ))}
                <p style={{ ...s.hint, marginTop: 4 }}>
                  User limit is set by the plan and cannot be overridden.
                  Currently: <strong>{data.maxUsers} users</strong>
                </p>
              </div>
            </div>
          )}

          {/* Step 2 — Branding */}
          {step === 2 && (
            <div style={s.section}>
              <h3 style={s.title}>Branding</h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {([
                  ["primaryColor", "Primary color"],
                  ["secondaryColor", "Secondary color"],
                  ["accentColor", "Accent color"],
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
                  Font family
                  <select style={{ ...s.select, marginTop: 4 }} value={data.fontFamily} onChange={(e) => set("fontFamily", e.target.value)}>
                    {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ ...s.label, marginTop: 8 }}>
                Logo <span style={s.hint}>(optional · PNG/SVG/JPG · max 500 KB)</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                  {data.logoPreview && (
                    <img src={data.logoPreview} alt="logo" style={{ width: 48, height: 48, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", padding: 4 }} />
                  )}
                  <button type="button" onClick={() => logoRef.current?.click()} style={s.btn("#64748b", true)}>
                    {data.logoPreview ? "Change" : "Upload logo"}
                  </button>
                  {data.logoPreview && (
                    <button type="button" onClick={() => { set("logoPreview", ""); if (logoRef.current) logoRef.current.value = ""; }} style={{ ...s.btn("#dc2626", true), background: "transparent", color: "#dc2626", border: "1px solid #fecaca" }}>
                      Remove
                    </button>
                  )}
                </div>
                <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoChange} />
              </label>
            </div>
          )}

          {/* Step 3 — Admin user */}
          {step === 3 && (
            <div style={s.section}>
              <h3 style={s.title}>Company Administrator</h3>
              <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>
                This person will be the initial COMPANY_ADMIN. A secure temporary password will be generated and emailed to them.
              </p>

              <label style={s.label}>
                Full name *
                <input style={s.input} value={data.adminName} placeholder="Jane Smith" onChange={(e) => set("adminName", e.target.value)} />
              </label>

              <label style={s.label}>
                Email address *
                <input type="email" style={s.input} value={data.adminEmail} placeholder="admin@acme.com" onChange={(e) => set("adminEmail", e.target.value)} />
              </label>

              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 16px", fontSize: 13, color: "#166534", marginTop: 8 }}>
                <strong>What happens next:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  <li>A 16-character password is generated server-side.</li>
                  <li>It's shown to you <em>once</em> after creation.</li>
                  <li>A welcome email is sent (if RESEND_API_KEY is set).</li>
                  <li>The admin must change it on first login.</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 4 — Review */}
          {step === 4 && (
            <div style={s.section}>
              <h3 style={s.title}>Review & Create</h3>

              <div style={s.card}>
                <p style={s.cardHead}>Company</p>
                <div style={s.row}><span style={s.rowLabel}>Name</span><strong>{data.name}</strong></div>
                <div style={s.row}><span style={s.rowLabel}>Slug</span><code>{data.slug}</code></div>
                <div style={s.row}><span style={s.rowLabel}>Industry</span><span>{INDUSTRIES.find(i => i.value === data.industry)?.label}</span></div>
                <div style={s.row}>
                  <span style={s.rowLabel}>Plan</span>
                  <span>{PLANS.find(p => p.value === data.plan)?.label} — up to {data.maxUsers} users</span>
                </div>
              </div>

              <div style={s.card}>
                <p style={s.cardHead}>Branding</p>
                <div style={s.row}>
                  <span style={s.rowLabel}>Colors</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[data.primaryColor, data.secondaryColor, data.accentColor].map((c) => (
                      <div key={c} title={c} style={{ width: 20, height: 20, borderRadius: 4, background: c, border: "1px solid #e2e8f0" }} />
                    ))}
                  </div>
                </div>
                <div style={s.row}><span style={s.rowLabel}>Font</span><span style={{ fontFamily: data.fontFamily }}>{data.fontFamily}</span></div>
                {data.logoPreview && (
                  <div style={s.row}><span style={s.rowLabel}>Logo</span><img src={data.logoPreview} alt="logo" style={{ height: 24, width: 24, objectFit: "contain" }} /></div>
                )}
              </div>

              <div style={s.card}>
                <p style={s.cardHead}>Administrator</p>
                <div style={s.row}><span style={s.rowLabel}>Name</span><span>{data.adminName}</span></div>
                <div style={s.row}><span style={s.rowLabel}>Email</span><span>{data.adminEmail}</span></div>
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
          ← {step === 1 ? "Cancel" : "Back"}
        </button>

        {step < 4 ? (
          <button
            disabled={!canAdvance()}
            onClick={() => setStep((step + 1) as Step)}
            style={{ ...s.btn("#2563eb"), opacity: canAdvance() ? 1 : 0.4, cursor: canAdvance() ? "pointer" : "not-allowed" }}
          >
            Next →
          </button>
        ) : (
          <button
            disabled={submitting}
            onClick={handleCreate}
            style={{ ...s.btn("#16a34a"), opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? "Creating…" : "Create Company"}
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
