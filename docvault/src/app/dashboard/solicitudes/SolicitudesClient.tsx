"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Check, X as XIcon } from "lucide-react";
import FileIcon from "@/components/FileIcon";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CRFile {
  id: string; name: string; nombreDocumento: string | null;
  codigo: string | null; storageKey: string; mimeType?: string;
}

interface CRUser { id: string; name: string; email: string; }

interface ChangeRequest {
  id: string;
  type: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  adminNotes: string | null;
  proposedChanges: Record<string, unknown>;
  file: CRFile | null;
  requestedBy: CRUser;
}

interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string; logoUrl: string | null };
  userRole: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const CR_TYPE_LABELS: Record<string, string> = {
  NEW_UPLOAD:           "Nueva subida",
  EDIT_METADATA:        "Edición de metadatos",
  REPLACE_FILE:         "Reemplazo de archivo",
  DELETE:               "Eliminación",
  REVISION_DATE_CHANGE: "Cambio de fecha de revisión",
  OTHER:                "Cambio de documento",
};

const CR_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  NEW_UPLOAD:           { bg: "#dbeafe", color: "#1e40af" },
  EDIT_METADATA:        { bg: "#fef3c7", color: "#92400e" },
  REPLACE_FILE:         { bg: "#ede9fe", color: "#5b21b6" },
  DELETE:               { bg: "#fee2e2", color: "#dc2626" },
  REVISION_DATE_CHANGE: { bg: "#e0f2fe", color: "#0369a1" },
  OTHER:                { bg: "#f3f4f6", color: "#374151" },
};

const FIELD_LABELS: Record<string, string> = {
  status:               "Estado",
  codigo:               "Código",
  nombreDocumento:      "Nombre del documento",
  versionStr:           "Versión",
  fechaEmision:         "Fecha de emisión",
  fechaRevision:        "Fecha de revisión",
  fechaActualizacion:   "Fecha de actualización",
  controlCambios:       "Control de cambios",
  encargadoDocumentoId: "Encargado",
};

const DATE_FIELD_KEYS = new Set(["fechaEmision", "fechaRevision", "fechaActualizacion"]);

function fmtVal(key: string, val: unknown): string {
  if (val === null || val === undefined) return "(vacío)";
  if (DATE_FIELD_KEYS.has(key) && typeof val === "string") {
    try { return new Date(val).toLocaleDateString("es-MX"); } catch { return val; }
  }
  return String(val);
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function SolicitudesClient({ company }: Props) {
  const router = useRouter();
  const p = company.primaryColor;

  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Per-card UI state
  const [rejectingId,  setRejectingId]  = useState<string | null>(null);
  const [rejectNote,   setRejectNote]   = useState<Record<string, string>>({});
  const [processing,   setProcessing]   = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/change-requests?view=pending");
    if (r.ok) setRequests((await r.json()).changeRequests ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  async function submitReview(id: string, action: "APPROVE" | "REJECT") {
    const note = rejectNote[id]?.trim();
    if (action === "REJECT" && !note) return;
    setProcessing(id);
    const res = await fetch(`/api/change-requests/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminNotes: note ?? null }),
    });
    setProcessing(null);
    if (res.ok) {
      setRequests((prev) => prev.filter((cr) => cr.id !== id));
      setRejectingId(null);
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Error al procesar la solicitud");
    }
  }

  async function downloadFile(fileId: string) {
    const res = await fetch(`/api/files/${fileId}/download-url`);
    if (!res.ok) { alert("No se pudo generar el enlace de descarga"); return; }
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  // ── Render a human-readable summary of proposedChanges ─────────────────────
  function renderProposal(cr: ChangeRequest) {
    const pc = cr.proposedChanges;

    if (cr.type === "NEW_UPLOAD") {
      const name = pc.name as string;
      const size = pc.size as number;
      return (
        <div style={{ fontSize: 13, color: "#475569" }}>
          <span>Nuevo archivo: <b>{name}</b>{size ? ` (${fmtSize(size)})` : ""}</span>
          {cr.file && (
            <button
              onClick={() => downloadFile(cr.file!.id)}
              style={{ marginLeft: 12, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: "#475569", fontWeight: 600 }}
            >
              ↓ Descargar para revisar
            </button>
          )}
        </div>
      );
    }

    if (cr.type === "EDIT_METADATA" || cr.type === "REVISION_DATE_CHANGE") {
      const before = pc.before as Record<string, unknown> | undefined;
      const after  = pc.after  as Record<string, unknown> | undefined;
      if (!after) return <span style={{ fontSize: 13, color: "#94a3b8" }}>Sin detalles</span>;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(after).map(([key, newVal]) => (
            <div key={key} style={{ fontSize: 13, color: "#475569" }}>
              <span style={{ fontWeight: 600, color: "#374151" }}>{FIELD_LABELS[key] ?? key}:</span>{" "}
              {before?.[key] !== undefined && (
                <span style={{ color: "#94a3b8", textDecoration: "line-through", marginRight: 6 }}>
                  {fmtVal(key, before[key])}
                </span>
              )}
              <span style={{ color: "#166534", fontWeight: 600 }}>{fmtVal(key, newVal)}</span>
            </div>
          ))}
        </div>
      );
    }

    if (cr.type === "DELETE") {
      return (
        <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
          Eliminar permanentemente este documento del sistema
        </span>
      );
    }

    if (cr.type === "REPLACE_FILE") {
      return (
        <div style={{ fontSize: 13, color: "#475569" }}>
          Reemplazar archivo con una nueva versión
          {cr.file && (
            <button
              onClick={() => downloadFile(cr.file!.id)}
              style={{ marginLeft: 12, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: "#475569", fontWeight: 600 }}
            >
              ↓ Descargar versión actual
            </button>
          )}
        </div>
      );
    }

    if (cr.type === "OTHER") {
      const updates = pc.proposedFileUpdates as Record<string, unknown> | undefined;
      if (!updates) return <span style={{ fontSize: 13, color: "#94a3b8" }}>Cambio al completar tarea</span>;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(updates).map(([key, val]) => (
            <div key={key} style={{ fontSize: 13, color: "#475569" }}>
              <span style={{ fontWeight: 600, color: "#374151" }}>{FIELD_LABELS[key] ?? key}:</span>{" "}
              <span style={{ color: "#166534" }}>{fmtVal(key, val)}</span>
            </div>
          ))}
        </div>
      );
    }

    return <span style={{ fontSize: 13, color: "#94a3b8" }}>Sin detalles disponibles</span>;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      <style>{`
        .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 14px; transition: box-shadow 0.15s; }
        .card:hover { box-shadow: 0 2px 14px rgba(0,0,0,0.07); }
        .btn { border: none; cursor: pointer; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; transition: opacity 0.15s; }
        .btn:hover { opacity: 0.85; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .back-btn { border: none; cursor: pointer; background: none; color: #64748b; font-size: 14px; padding: 6px 12px; border-radius: 6px; display: flex; align-items: center; gap: 6px; transition: background 0.15s; }
        .back-btn:hover { background: #e2e8f0; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 10px; }
      `}</style>

      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px", height: 60, display: "flex", alignItems: "center", gap: 16 }}>
        <button className="back-btn" onClick={() => router.push("/dashboard")}>← Volver al Dashboard</button>
        <div style={{ width: 1, height: 24, background: "#e2e8f0" }} />
        <span style={{ fontWeight: 700, fontSize: 18, color: "#1e293b" }}>Solicitudes de Cambio</span>
        {requests.length > 0 && (
          <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 10, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
            {requests.length} pendiente{requests.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>

        {/* Explanation banner */}
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 18px", marginBottom: 28, fontSize: 13, color: "#1e40af" }}>
          Los usuarios con nivel Editor deben solicitar aprobación para subir, editar o eliminar documentos.
          Revisa cada solicitud y acepta o rechaza con un motivo.
        </div>

        {loading ? (
          [1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 140, marginBottom: 14 }} />)
        ) : requests.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8" }}>
            <div style={{ marginBottom: 16 }}><CheckCircle size={48} color="#22c55e" /></div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>No hay solicitudes pendientes</div>
            <div style={{ fontSize: 13 }}>Todas las solicitudes han sido revisadas.</div>
          </div>
        ) : (
          requests.map((cr) => {
            const tc  = CR_TYPE_COLORS[cr.type] ?? { bg: "#f3f4f6", color: "#374151" };
            const doc = cr.file?.nombreDocumento || cr.file?.name || "Documento eliminado";
            const isRejecting  = rejectingId === cr.id;
            const isProcessing = processing === cr.id;

            return (
              <div key={cr.id} className="card" style={{ borderLeft: `4px solid ${p}` }}>

                {/* Header row */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                  {cr.file && (
                    <FileIcon mimeType={(cr.file as any).mimeType ?? "application/octet-stream"} size={28} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{doc}</span>
                      <span style={{ background: tc.bg, color: tc.color, borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                        {CR_TYPE_LABELS[cr.type] ?? cr.type}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                      {cr.file?.codigo && <span>Código: <b>{cr.file.codigo}</b></span>}
                      <span>Solicitado por: <b>{cr.requestedBy.name}</b></span>
                      <span>{new Date(cr.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}</span>
                    </div>
                  </div>
                </div>

                {/* Proposal preview */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Cambio propuesto
                  </div>
                  {renderProposal(cr)}
                </div>

                {/* Action area */}
                {!isRejecting ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn"
                      disabled={isProcessing}
                      onClick={() => submitReview(cr.id, "APPROVE")}
                      style={{ background: "#dcfce7", color: "#166534" }}
                    >
                      {isProcessing ? "Procesando…" : <><Check size={13} style={{ marginRight: 4 }} />Aceptar</>}
                    </button>
                    <button
                      className="btn"
                      disabled={isProcessing}
                      onClick={() => { setRejectingId(cr.id); setRejectNote((n) => ({ ...n, [cr.id]: "" })); }}
                      style={{ background: "#fee2e2", color: "#dc2626" }}
                    >
                      <XIcon size={13} style={{ marginRight: 4 }} />Rechazar
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
                        Motivo del rechazo <span style={{ color: "#dc2626" }}>*</span>
                      </label>
                      <textarea
                        autoFocus
                        rows={3}
                        placeholder="Explica por qué se rechaza esta solicitud…"
                        value={rejectNote[cr.id] ?? ""}
                        onChange={(e) => setRejectNote((n) => ({ ...n, [cr.id]: e.target.value }))}
                        style={{ width: "100%", padding: "9px 11px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, resize: "vertical", boxSizing: "border-box", outline: "none" }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          className="btn"
                          disabled={isProcessing || !rejectNote[cr.id]?.trim()}
                          onClick={() => submitReview(cr.id, "REJECT")}
                          style={{ background: "#dc2626", color: "#fff" }}
                        >
                          {isProcessing ? "Procesando…" : "Confirmar rechazo"}
                        </button>
                        <button
                          className="btn"
                          disabled={isProcessing}
                          onClick={() => setRejectingId(null)}
                          style={{ background: "#f1f5f9", color: "#64748b" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
