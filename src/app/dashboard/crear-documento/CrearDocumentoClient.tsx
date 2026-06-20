"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, X, UserPlus, CheckCircle, FilePlus } from "lucide-react";

interface Folder { id: string; name: string; parentId: string | null; }
interface UserOption { id: string; name: string; email: string; role: string; }
interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string };
  folders: Folder[];
  users: UserOption[];
  currentUserId: string;
}

const TIPO_OPTIONS = [
  { value: "PROCEDIMIENTO", label: "Procedimiento" },
  { value: "MANUAL",        label: "Manual" },
  { value: "INSTRUCTIVO",   label: "Instructivo" },
  { value: "FORMATO",       label: "Formato" },
  { value: "POLITICA",      label: "Política" },
  { value: "OTRO",          label: "Otro" },
];

const STEPS = ["Información", "Archivo", "Revisores", "Confirmar"];

export default function CrearDocumentoClient({ company, folders, users, currentUserId }: Props) {
  const router = useRouter();
  const brand  = company.primaryColor;

  const [step, setStep] = useState(0);

  // Step 0 — Document info
  const [nombre,       setNombre]       = useState("");
  const [departamento, setDepartamento] = useState("");
  const [tipo,         setTipo]         = useState("PROCEDIMIENTO");
  const [version,      setVersion]      = useState("v1.0");
  const [folderId,     setFolderId]     = useState("");

  // Step 1 — File upload
  const fileRef    = useRef<HTMLInputElement>(null);
  const [file,     setFile]     = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [storageKey, setStorageKey] = useState("");

  // Step 2 — Reviewers (ordered)
  const [reviewers,  setReviewers]  = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [dragIdx,    setDragIdx]    = useState<number | null>(null);

  // Step 3 — Submit
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState("");

  const availableUsers = users.filter(
    (u) => u.id !== currentUserId && !reviewers.find((r) => r.id === u.id)
  );
  const filteredUsers  = userSearch
    ? availableUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : availableUsers;

  function addReviewer(u: UserOption) {
    setReviewers((prev) => [...prev, u]);
    setUserSearch("");
  }

  function removeReviewer(id: string) {
    setReviewers((prev) => prev.filter((r) => r.id !== id));
  }

  function moveReviewer(from: number, to: number) {
    const arr = [...reviewers];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setReviewers(arr);
  }

  async function uploadSelectedFile() {
    if (!file) return;
    setUploading(true); setUploadProgress("Preparando subida…");
    try {
      const urlRes = await fetch("/api/files/upload-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size }),
      });
      if (!urlRes.ok) { setError((await urlRes.json()).error ?? "Error al preparar la subida"); return; }
      const { uploadUrl, storageKey: key } = await urlRes.json();
      setUploadProgress("Subiendo archivo…");
      const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!putRes.ok) { setError("Error al subir el archivo al almacenamiento"); return; }
      setStorageKey(key);
      setUploadProgress("");
      setStep(2);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!file || !storageKey || reviewers.length === 0) return;
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/crear-documento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey,
          name:         file.name,
          mimeType:     file.type || "application/octet-stream",
          size:         file.size,
          nombreDocumento: nombre,
          departamento,
          tipoDocumento: tipo,
          versionStr:   version,
          ...(folderId ? { folderId } : {}),
          reviewerIds:  reviewers.map((r) => r.id),
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error al crear documento"); return; }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  const canStep0 = nombre.trim() && departamento.trim() && tipo && version.trim();
  const canStep1 = !!file;
  const canStep2 = reviewers.length > 0;

  if (done) {
    return (
      <main style={{ minHeight: "100vh", background: "#f1f5f9", display: "grid", placeItems: "center" }}>
        <div style={{ background: "#fff", padding: 48, borderRadius: 16, textAlign: "center", maxWidth: 420, border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}>
          <CheckCircle size={52} color="#16a34a" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: "0 0 8px", color: "#1e293b" }}>Documento creado</h2>
          <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 14 }}>
            El documento "{nombre}" fue creado y enviado al primer revisor.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            style={{ background: brand, color: "#fff", border: "none", padding: "12px 28px", borderRadius: 9, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            Volver al dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      {/* Header */}
      <header style={{ background: brand, color: "#fff", padding: "14px 28px", display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={() => router.push("/dashboard")}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
        >
          ← Dashboard
        </button>
        <strong style={{ fontSize: 16 }}>Crear Documento</strong>
      </header>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px" }}>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 0, marginBottom: 32, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{
              flex: 1, textAlign: "center", padding: "12px 8px",
              background: i === step ? brand : i < step ? "#f0fdf4" : "#fff",
              color: i === step ? "#fff" : i < step ? "#16a34a" : "#94a3b8",
              fontWeight: i === step ? 700 : 500, fontSize: 13,
              borderRight: i < STEPS.length - 1 ? "1px solid #e2e8f0" : "none",
              cursor: i < step ? "pointer" : "default",
              transition: "background 0.2s",
            }} onClick={() => i < step && setStep(i)}>
              {i < step ? "✓ " : `${i + 1}. `}{s}
            </div>
          ))}
        </div>

        {/* Card */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "28px 32px" }}>

          {/* ── Step 0: Info ── */}
          {step === 0 && (
            <div>
              <h2 style={{ margin: "0 0 20px", fontSize: 18, color: "#1e293b", display: "flex", alignItems: "center", gap: 10 }}>
                <FilePlus size={20} color={brand} /> Información del documento
              </h2>

              <label style={ls}>Nombre del documento <span style={{ color: "#dc2626" }}>*</span></label>
              <input style={is} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Manual de Calidad 2026" autoFocus />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
                <div>
                  <label style={ls}>Departamento <span style={{ color: "#dc2626" }}>*</span></label>
                  <input style={is} value={departamento} onChange={(e) => setDepartamento(e.target.value)} placeholder="ej. Operaciones" />
                </div>
                <div>
                  <label style={ls}>Tipo de documento <span style={{ color: "#dc2626" }}>*</span></label>
                  <select style={is} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {TIPO_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
                <div>
                  <label style={ls}>Versión</label>
                  <input style={is} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.0" />
                </div>
                <div>
                  <label style={ls}>Carpeta (opcional)</label>
                  <select style={is} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                    <option value="">— Sin carpeta —</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <button
                disabled={!canStep0}
                onClick={() => setStep(1)}
                style={{ ...btnStyle(brand), marginTop: 28, opacity: canStep0 ? 1 : 0.5 }}
              >
                Siguiente: Archivo →
              </button>
            </div>
          )}

          {/* ── Step 1: File ── */}
          {step === 1 && (
            <div>
              <h2 style={{ margin: "0 0 20px", fontSize: 18, color: "#1e293b" }}>Adjuntar archivo</h2>

              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${file ? brand : "#d1d5db"}`, borderRadius: 10, padding: 40,
                  textAlign: "center", cursor: "pointer", background: file ? "#f0fdf4" : "#fafafa",
                  transition: "border-color 0.2s",
                }}
              >
                {file ? (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{file.name}</div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div>
                    <div style={{ color: brand, fontSize: 13, marginTop: 8 }}>Clic para cambiar archivo</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 14, color: "#64748b" }}>Haz clic o arrastra un archivo aquí</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>PDF, Word, Excel, imágenes…</div>
                  </div>
                )}
                <input
                  ref={fileRef} type="file" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); setStorageKey(""); }}
                />
              </div>

              {error && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{error}</p>}
              {uploadProgress && <p style={{ color: "#64748b", fontSize: 13, marginTop: 10 }}>{uploadProgress}</p>}

              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button onClick={() => setStep(0)} style={backBtn}>← Atrás</button>
                {storageKey ? (
                  <button onClick={() => setStep(2)} style={btnStyle(brand)}>
                    Siguiente: Revisores →
                  </button>
                ) : (
                  <button
                    disabled={!canStep1 || uploading}
                    onClick={uploadSelectedFile}
                    style={{ ...btnStyle(brand), opacity: canStep1 && !uploading ? 1 : 0.5 }}
                  >
                    {uploading ? uploadProgress || "Subiendo…" : "Subir archivo →"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Reviewers ── */}
          {step === 2 && (
            <div>
              <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "#1e293b" }}>Cadena de revisores</h2>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>
                Define quién revisa el documento y en qué orden. Cada revisor debe aprobar antes de que pase al siguiente.
              </p>

              {/* Search and add */}
              <div style={{ marginBottom: 16 }}>
                <label style={ls}>Agregar revisor</label>
                <input
                  style={is} value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Buscar por nombre o correo…"
                />
                {userSearch && filteredUsers.length > 0 && (
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: "auto", background: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                    {filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => addReviewer(u)}
                        style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                      >
                        <UserPlus size={14} color="#64748b" />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{u.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Ordered reviewer list */}
              {reviewers.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", border: "1px dashed #e2e8f0", borderRadius: 8, fontSize: 14 }}>
                  Agrega al menos un revisor para continuar.
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Orden de revisión
                  </div>
                  {reviewers.map((r, idx) => (
                    <div key={r.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "#f8fafc", border: "1px solid #e2e8f0",
                      borderRadius: 8, padding: "10px 12px", marginBottom: 8,
                    }}>
                      <span style={{ background: brand, color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {idx + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.email}</div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {idx > 0 && (
                          <button onClick={() => moveReviewer(idx, idx - 1)} style={iconBtn} title="Mover arriba">↑</button>
                        )}
                        {idx < reviewers.length - 1 && (
                          <button onClick={() => moveReviewer(idx, idx + 1)} style={iconBtn} title="Mover abajo">↓</button>
                        )}
                        <button onClick={() => removeReviewer(r.id)} style={{ ...iconBtn, color: "#dc2626" }} title="Eliminar">
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button onClick={() => setStep(1)} style={backBtn}>← Atrás</button>
                <button
                  disabled={!canStep2}
                  onClick={() => setStep(3)}
                  style={{ ...btnStyle(brand), opacity: canStep2 ? 1 : 0.5 }}
                >
                  Siguiente: Confirmar →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 3 && (
            <div>
              <h2 style={{ margin: "0 0 20px", fontSize: 18, color: "#1e293b" }}>Confirmar y crear</h2>

              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "18px 20px", marginBottom: 20 }}>
                <Row label="Nombre" value={nombre} />
                <Row label="Departamento" value={departamento} />
                <Row label="Tipo" value={TIPO_OPTIONS.find((t) => t.value === tipo)?.label ?? tipo} />
                <Row label="Versión" value={version} />
                {folderId && <Row label="Carpeta" value={folders.find((f) => f.id === folderId)?.name ?? folderId} />}
                <Row label="Archivo" value={file?.name ?? "—"} />
                <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>Cadena de revisores</div>
                  {reviewers.map((r, i) => (
                    <div key={r.id} style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: brand }}>Paso {i + 1}:</span> {r.name}
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                  <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(2)} style={backBtn}>← Atrás</button>
                <button
                  disabled={submitting}
                  onClick={submit}
                  style={{ ...btnStyle(brand), opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? "Creando documento…" : "Crear documento"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#1e293b" }}>{value}</span>
    </div>
  );
}

const ls: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 5 };
const is: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box", outline: "none" };
const iconBtn: React.CSSProperties = { background: "none", border: "1px solid #e2e8f0", color: "#64748b", borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center" };
const backBtn: React.CSSProperties = { background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "10px 18px", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" };
const btnStyle = (brand: string): React.CSSProperties => ({
  background: brand, color: "#fff", border: "none", padding: "12px 24px", borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: "pointer",
});
