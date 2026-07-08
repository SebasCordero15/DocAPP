"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle, Check, X as XIcon, Plus, ChevronDown, ChevronUp } from "lucide-react";
import FileIcon from "@/components/FileIcon";

// ─── Shared types ───────────────────────────────────────────────────────────────

interface CRFile {
  id: string; name: string; nombreDocumento: string | null;
  codigo: string | null; storageKey: string; mimeType?: string; versionStr?: string | null;
}
interface CRUser { id: string; name: string; email: string; }

interface ChangeRequest {
  id: string; type: string; status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string; adminNotes: string | null;
  proposedChanges: Record<string, unknown>;
  file: CRFile | null; requestedBy: CRUser;
}

interface OFile {
  id: string; name: string; nombreDocumento: string | null;
  codigo: string | null; mimeType: string; versionStr: string | null;
}
interface OUser { id: string; name: string; email: string; }

interface OutgoingTask {
  id: string; stepOrder: number; status: string;
  assignedTo: OUser;
}

interface OutgoingRequest {
  id: string; type: "ACTUALIZACION" | "REVISION" | "CORRECCION";
  status: "PENDING" | "IN_PROGRESS" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
  instructions: string | null; correctionFields: Record<string, unknown> | null;
  currentStep: number; totalSteps: number;
  outcomeType: string | null; pendingVersionStr: string | null;
  pendingMetadata: Record<string, unknown> | null;
  file: OFile; createdBy: OUser; finalReviewer: OUser | null;
  finalNotes: string | null; finalReviewedAt: string | null;
  tasks: OutgoingTask[]; createdAt: string;
}

interface CompanyUser { id: string; name: string; email: string; role: string; isActive: boolean; }

interface FileOption { id: string; name: string; nombreDocumento: string | null; codigo: string | null; versionStr: string | null; mimeType: string; }

interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string; logoUrl: string | null };
  userRole: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const CR_TYPE_LABELS: Record<string, string> = {
  NEW_UPLOAD: "Nueva subida", EDIT_METADATA: "Edición de metadatos",
  REPLACE_FILE: "Reemplazo de archivo", DELETE: "Eliminación",
  REVISION_DATE_CHANGE: "Cambio de fecha de revisión", OTHER: "Cambio de documento",
};
const CR_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  NEW_UPLOAD: { bg: "#dbeafe", color: "#1e40af" },
  EDIT_METADATA: { bg: "#fef3c7", color: "#92400e" },
  REPLACE_FILE: { bg: "#ede9fe", color: "#5b21b6" },
  DELETE: { bg: "#fee2e2", color: "#dc2626" },
  REVISION_DATE_CHANGE: { bg: "#e0f2fe", color: "#0369a1" },
  OTHER: { bg: "#f3f4f6", color: "#374151" },
};
const FIELD_LABELS: Record<string, string> = {
  status: "Estado", codigo: "Código", nombreDocumento: "Nombre del documento",
  versionStr: "Versión", fechaEmision: "Fecha de emisión", fechaRevision: "Fecha de revisión",
  fechaActualizacion: "Fecha de actualización", controlCambios: "Control de cambios",
  encargadoDocumentoId: "Encargado",
};
const DATE_FIELD_KEYS = new Set(["fechaEmision", "fechaRevision", "fechaActualizacion"]);

const OUT_TYPE_LABELS: Record<string, string> = {
  ACTUALIZACION: "Actualización", REVISION: "Revisión", CORRECCION: "Corrección",
};
const OUT_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  ACTUALIZACION: { bg: "#dbeafe", color: "#1e40af" },
  REVISION: { bg: "#fef3c7", color: "#92400e" },
  CORRECCION: { bg: "#ede9fe", color: "#5b21b6" },
};
const OUT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente", IN_PROGRESS: "En progreso",
  PENDING_APPROVAL: "Pendiente de aprobación", APPROVED: "Aprobada",
  REJECTED: "Rechazada", CANCELLED: "Cancelada",
};
const OUT_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING:           { bg: "#f1f5f9", color: "#64748b" },
  IN_PROGRESS:       { bg: "#fef3c7", color: "#92400e" },
  PENDING_APPROVAL:  { bg: "#ede9fe", color: "#5b21b6" },
  APPROVED:          { bg: "#dcfce7", color: "#166534" },
  REJECTED:          { bg: "#fee2e2", color: "#dc2626" },
  CANCELLED:         { bg: "#f3f4f6", color: "#94a3b8" },
};
const OUTCOME_LABELS: Record<string, string> = {
  no_changes: "Sin cambios necesarios",
  new_version: "Nueva versión subida",
  corrected: "Corrección aplicada",
};

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

// ─── Main component ──────────────────────────────────────────────────────────────

export default function SolicitudesClient({ company, userRole }: Props) {
  const p = company.primaryColor;
  const isAdmin = userRole === "COMPANY_ADMIN" || userRole === "SUPER_ADMIN";

  const [tab, setTab] = useState<"entrantes" | "salientes">("entrantes");

  // ── Entrantes state ──────────────────────────────────────────────────────────
  const [crs, setCrs] = useState<ChangeRequest[]>([]);
  const [loadingCrs, setLoadingCrs] = useState(true);
  const [rejectingId,  setRejectingId]  = useState<string | null>(null);
  const [rejectNote,   setRejectNote]   = useState<Record<string, string>>({});
  const [processing,   setProcessing]   = useState<string | null>(null);
  const [approvingId,  setApprovingId]  = useState<string | null>(null);
  const [approveCodigo, setApproveCodigo] = useState<Record<string, string>>({});
  const [approveVersionStr, setApproveVersionStr] = useState<Record<string, string>>({});

  // ── Salientes state ──────────────────────────────────────────────────────────
  const [outgoing,    setOutgoing]    = useState<OutgoingRequest[]>([]);
  const [loadingOut,  setLoadingOut]  = useState(true);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewVer,   setReviewVer]   = useState<Record<string, string>>({});
  const [outProcessing, setOutProcessing] = useState<string | null>(null);

  // ── Create modal state ───────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [allFiles,   setAllFiles]   = useState<FileOption[]>([]);
  const [allUsers,   setAllUsers]   = useState<CompanyUser[]>([]);
  const [fileSearch, setFileSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<FileOption | null>(null);
  const [outType, setOutType] = useState<"ACTUALIZACION" | "REVISION" | "CORRECCION">("ACTUALIZACION");
  const [instructions, setInstructions] = useState("");
  const [corrFields, setCorrFields] = useState({ nombre: false, contenido: false, area: false, carpeta: false, otro: "" });
  const [assignees, setAssignees] = useState<string[]>([""]);
  const [dueDate,   setDueDate]   = useState<string>("");
  const [creating,  setCreating]  = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Fetch data ───────────────────────────────────────────────────────────────
  const fetchCrs = useCallback(async () => {
    setLoadingCrs(true);
    const r = await fetch("/api/change-requests?view=pending");
    if (r.ok) setCrs((await r.json()).changeRequests ?? []);
    setLoadingCrs(false);
  }, []);

  const fetchOutgoing = useCallback(async () => {
    setLoadingOut(true);
    const r = await fetch("/api/outgoing-requests");
    if (r.ok) setOutgoing((await r.json()).outgoingRequests ?? []);
    setLoadingOut(false);
  }, []);

  useEffect(() => { fetchCrs(); }, [fetchCrs]);
  useEffect(() => { if (isAdmin) fetchOutgoing(); else setLoadingOut(false); }, [fetchOutgoing, isAdmin]);

  // ── Fetch create-modal data ──────────────────────────────────────────────────
  async function openCreateModal() {
    setShowCreate(true);
    setCreateError(null);
    setSelectedFile(null); setFileSearch(""); setOutType("ACTUALIZACION");
    setInstructions(""); setCorrFields({ nombre: false, contenido: false, area: false, carpeta: false, otro: "" });
    setAssignees([""]); setDueDate("");

    if (allFiles.length === 0) {
      const r = await fetch("/api/listado-maestro");
      if (r.ok) {
        const d = await r.json();
        setAllFiles(d.files ?? []);
      }
    }
    if (allUsers.length === 0) {
      const r = await fetch("/api/admin/users");
      if (r.ok) {
        const d = await r.json();
        setAllUsers((d.users ?? []).filter((u: CompanyUser) => u.isActive));
      }
    }
  }

  // ── Entrantes actions ────────────────────────────────────────────────────────
  async function submitCrReview(id: string, action: "APPROVE" | "REJECT", assignedCodigo?: string, adminVersionStr?: string) {
    const note = rejectNote[id]?.trim();
    if (action === "REJECT" && !note) return;
    setProcessing(id);
    const res = await fetch(`/api/change-requests/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        adminNotes: note ?? null,
        assignedCodigo: assignedCodigo ?? null,
        adminVersionStr: adminVersionStr ?? null,
      }),
    });
    setProcessing(null);
    if (res.ok) {
      setCrs((prev) => prev.filter((cr) => cr.id !== id));
      setRejectingId(null); setApprovingId(null);
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Error al procesar la solicitud");
    }
  }

  async function startApproveCr(cr: ChangeRequest) {
    if (cr.type === "DELETE") { submitCrReview(cr.id, "APPROVE"); return; }
    if (cr.type === "NEW_UPLOAD") {
      const r = await fetch("/api/files/next-codigo");
      const suggested = r.ok ? (await r.json()).codigo : "";
      setApproveCodigo((prev) => ({ ...prev, [cr.id]: suggested }));
    }
    const currentVersion = cr.file?.versionStr ?? "";
    setApproveVersionStr((prev) => ({ ...prev, [cr.id]: currentVersion ?? "" }));
    setApprovingId(cr.id);
  }

  async function downloadFile(fileId: string) {
    const res = await fetch(`/api/files/${fileId}/download-url`);
    if (!res.ok) { alert("No se pudo generar el enlace de descarga"); return; }
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  // ── Salientes actions ────────────────────────────────────────────────────────
  async function cancelOutgoing(id: string) {
    if (!confirm("¿Cancelar esta solicitud saliente?")) return;
    setOutProcessing(id);
    const res = await fetch(`/api/outgoing-requests/${id}/cancel`, { method: "POST" });
    setOutProcessing(null);
    if (res.ok) {
      setOutgoing((prev) => prev.map((o) => o.id === id ? { ...o, status: "CANCELLED" } : o));
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Error al cancelar");
    }
  }

  async function submitOutReview(id: string, decision: "APPROVED" | "REJECTED") {
    const notes = reviewNotes[id]?.trim();
    if (decision === "REJECTED" && !notes) return;
    const versionStr = reviewVer[id]?.trim() || null;
    setOutProcessing(id);
    const res = await fetch(`/api/outgoing-requests/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, notes: notes || null, versionStr }),
    });
    setOutProcessing(null);
    if (res.ok) {
      await fetchOutgoing();
      setReviewingId(null);
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Error al procesar la revisión");
    }
  }

  // ── Create outgoing request ──────────────────────────────────────────────────
  async function submitCreate() {
    if (!selectedFile) { setCreateError("Selecciona un documento"); return; }
    const assigneeIds = assignees.map((a) => a.trim()).filter(Boolean);
    if (assigneeIds.length === 0) { setCreateError("Selecciona al menos un asignado"); return; }
    if (outType === "CORRECCION" && !instructions.trim()) {
      setCreateError("Las instrucciones son obligatorias para una corrección"); return;
    }
    if (outType === "CORRECCION") {
      const anyChecked = corrFields.nombre || corrFields.contenido || corrFields.area || corrFields.carpeta || corrFields.otro.trim();
      if (!anyChecked) { setCreateError("Especifica qué corregir"); return; }
    }
    setCreating(true); setCreateError(null);
    const res = await fetch("/api/outgoing-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId: selectedFile.id, type: outType,
        instructions: instructions.trim() || null,
        correctionFields: outType === "CORRECCION" ? {
          nombre: corrFields.nombre, contenido: corrFields.contenido,
          area: corrFields.area, carpeta: corrFields.carpeta,
          otro: corrFields.otro.trim() || null,
        } : null,
        assigneeIds, dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      }),
    });
    setCreating(false);
    if (res.ok) {
      setShowCreate(false);
      await fetchOutgoing();
      setTab("salientes");
    } else {
      const d = await res.json().catch(() => ({}));
      setCreateError(d.error ?? "Error al crear la solicitud");
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────────

  function renderCrProposal(cr: ChangeRequest) {
    const pc = cr.proposedChanges;
    if (cr.type === "NEW_UPLOAD") {
      const name = pc.name as string; const size = pc.size as number;
      return (
        <div style={{ fontSize: 13, color: "#475569" }}>
          Nuevo archivo: <b>{name}</b>{size ? ` (${fmtSize(size)})` : ""}
          {cr.file && (
            <button onClick={() => downloadFile(cr.file!.id)} style={{ marginLeft: 12, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: "#475569", fontWeight: 600 }}>
              Descargar para revisar
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
                <span style={{ color: "#94a3b8", textDecoration: "line-through", marginRight: 6 }}>{fmtVal(key, before[key])}</span>
              )}
              <span style={{ color: "#166534", fontWeight: 600 }}>{fmtVal(key, newVal)}</span>
            </div>
          ))}
        </div>
      );
    }
    if (cr.type === "DELETE") return <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>Eliminar permanentemente este documento del sistema</span>;
    if (cr.type === "REPLACE_FILE") return <div style={{ fontSize: 13, color: "#475569" }}>Reemplazar archivo con una nueva versión{cr.file && <button onClick={() => downloadFile(cr.file!.id)} style={{ marginLeft: 12, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}>Descargar versión actual</button>}</div>;
    if (cr.type === "OTHER") {
      const updates = pc.proposedFileUpdates as Record<string, unknown> | undefined;
      if (!updates) return <span style={{ fontSize: 13, color: "#94a3b8" }}>Cambio al completar tarea</span>;
      return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{Object.entries(updates).map(([key, val]) => <div key={key} style={{ fontSize: 13 }}><span style={{ fontWeight: 600 }}>{FIELD_LABELS[key] ?? key}:</span> {fmtVal(key, val)}</div>)}</div>;
    }
    return <span style={{ fontSize: 13, color: "#94a3b8" }}>Sin detalles disponibles</span>;
  }

  const filteredFiles = allFiles.filter((f) => {
    const q = fileSearch.toLowerCase();
    return (f.nombreDocumento ?? f.name).toLowerCase().includes(q) || (f.codigo ?? "").toLowerCase().includes(q);
  }).slice(0, 12);

  const pendingCrs    = crs.length;
  const pendingOutRev = outgoing.filter((o) => o.status === "PENDING_APPROVAL").length;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f8fafc", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      <style>{`
        .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 14px; }
        .card:hover { box-shadow: 0 2px 14px rgba(0,0,0,0.07); }
        .btn { border: none; cursor: pointer; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; transition: opacity 0.15s; }
        .btn:hover { opacity: 0.85; } .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .tab-btn { border: none; cursor: pointer; padding: 10px 20px; font-size: 14px; font-weight: 600; border-bottom: 3px solid transparent; background: none; transition: all 0.15s; color: #64748b; }
        .tab-btn.active { border-bottom-color: ${p}; color: ${p}; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton { background: linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 10px; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .modal { background: #fff; border-radius: 16px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; padding: 28px; }
        .form-label { display: block; font-size: 12px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 5px; }
        .form-input { width: 100%; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; box-sizing: border-box; }
        .form-input:focus { border-color: ${p}; }
        .form-select { width: 100%; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; background: #fff; outline: none; }
        .type-pill { padding: 8px 14px; border-radius: 8px; border: 2px solid #e2e8f0; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; background: #fff; }
        .type-pill.selected { border-color: ${p}; background: #eff6ff; color: ${p}; }
        .step-dot { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
      `}</style>

      {/* Header with tabs */}
      <div style={{ background: p, color: "#fff", padding: "12px 28px 0", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Solicitudes</strong>
          {isAdmin && (
            <button
              onClick={openCreateModal}
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 8, color: "#fff", padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              <Plus size={14} /> Nueva solicitud saliente
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className={`tab-btn${tab === "entrantes" ? " active" : ""}`} onClick={() => setTab("entrantes")} style={{ color: tab === "entrantes" ? "#fff" : "rgba(255,255,255,0.7)", borderBottomColor: tab === "entrantes" ? "#fff" : "transparent" }}>
            Entrantes
            {pendingCrs > 0 && <span style={{ marginLeft: 6, background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{pendingCrs}</span>}
          </button>
          {isAdmin && (
            <button className={`tab-btn${tab === "salientes" ? " active" : ""}`} onClick={() => setTab("salientes")} style={{ color: tab === "salientes" ? "#fff" : "rgba(255,255,255,0.7)", borderBottomColor: tab === "salientes" ? "#fff" : "transparent" }}>
              Salientes
              {pendingOutRev > 0 && <span style={{ marginLeft: 6, background: "#f59e0b", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{pendingOutRev}</span>}
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Tab: Entrantes ── */}
        {tab === "entrantes" && (
          <>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 18px", marginBottom: 28, fontSize: 13, color: "#1e40af" }}>
              Los usuarios con nivel Editor deben solicitar aprobación para subir, editar o eliminar documentos.
              Revisa cada solicitud y acepta o rechaza con un motivo.
            </div>
            {loadingCrs ? (
              [1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 140, marginBottom: 14 }} />)
            ) : crs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8" }}>
                <div style={{ marginBottom: 16 }}><CheckCircle size={48} color="#22c55e" /></div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>No hay solicitudes pendientes</div>
                <div style={{ fontSize: 13 }}>Todas las solicitudes han sido revisadas.</div>
              </div>
            ) : (
              crs.map((cr) => {
                const tc = CR_TYPE_COLORS[cr.type] ?? { bg: "#f3f4f6", color: "#374151" };
                const doc = cr.file?.nombreDocumento || cr.file?.name || "Documento eliminado";
                const isRejecting  = rejectingId === cr.id;
                const isApproving  = approvingId === cr.id;
                const isProcessing = processing  === cr.id;
                return (
                  <div key={cr.id} className="card" style={{ borderLeft: `4px solid ${p}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                      {cr.file && <FileIcon mimeType={(cr.file as CRFile & { mimeType?: string }).mimeType ?? "application/octet-stream"} size={28} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{doc}</span>
                          <span style={{ background: tc.bg, color: tc.color, borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{CR_TYPE_LABELS[cr.type] ?? cr.type}</span>
                        </div>
                        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                          {cr.file?.codigo && <span>Código: <b>{cr.file.codigo}</b></span>}
                          <span>Solicitado por: <b>{cr.requestedBy.name}</b></span>
                          <span>{new Date(cr.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Cambio propuesto</div>
                      {renderCrProposal(cr)}
                    </div>
                    {!isRejecting && !isApproving ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn" disabled={isProcessing} onClick={() => startApproveCr(cr)} style={{ background: "#dcfce7", color: "#166534" }}>
                          {isProcessing ? "Procesando…" : <><Check size={13} style={{ marginRight: 4 }} />Aceptar</>}
                        </button>
                        <button className="btn" disabled={isProcessing} onClick={() => { setRejectingId(cr.id); setRejectNote((n) => ({ ...n, [cr.id]: "" })); }} style={{ background: "#fee2e2", color: "#dc2626" }}>
                          <XIcon size={13} style={{ marginRight: 4 }} />Rechazar
                        </button>
                      </div>
                    ) : isApproving ? (
                      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
                        {cr.type === "NEW_UPLOAD" && (
                          <div style={{ marginBottom: 12 }}>
                            <label className="form-label">Asignar código de documento</label>
                            <input
                              autoFocus
                              value={approveCodigo[cr.id] ?? ""}
                              onChange={(e) => setApproveCodigo((n) => ({ ...n, [cr.id]: e.target.value }))}
                              placeholder="DOC-001"
                              className="form-input"
                              style={{ width: 160 }}
                            />
                            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>Deja vacío para aprobar sin código.</p>
                          </div>
                        )}
                        <div style={{ marginBottom: 12 }}>
                          <label className="form-label">Versión del documento</label>
                          <input
                            value={approveVersionStr[cr.id] ?? ""}
                            onChange={(e) => setApproveVersionStr((n) => ({ ...n, [cr.id]: e.target.value }))}
                            placeholder="v1.0"
                            className="form-input"
                            style={{ width: 160 }}
                          />
                          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>Deja vacío para mantener la versión actual.</p>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn"
                            disabled={isProcessing}
                            onClick={() => submitCrReview(
                              cr.id, "APPROVE",
                              cr.type === "NEW_UPLOAD" ? (approveCodigo[cr.id] || undefined) : undefined,
                              approveVersionStr[cr.id]?.trim() || undefined,
                            )}
                            style={{ background: "#dcfce7", color: "#166534" }}
                          >
                            {isProcessing ? "Procesando…" : <><Check size={13} style={{ marginRight: 4 }} />Confirmar</>}
                          </button>
                          <button className="btn" disabled={isProcessing} onClick={() => setApprovingId(null)} style={{ background: "#f1f5f9", color: "#64748b" }}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
                        <label className="form-label">Motivo del rechazo <span style={{ color: "#dc2626" }}>*</span></label>
                        <textarea autoFocus rows={3} placeholder="Explica por qué se rechaza esta solicitud…" value={rejectNote[cr.id] ?? ""} onChange={(e) => setRejectNote((n) => ({ ...n, [cr.id]: e.target.value }))} className="form-input" style={{ resize: "vertical" }} />
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button className="btn" disabled={isProcessing || !rejectNote[cr.id]?.trim()} onClick={() => submitCrReview(cr.id, "REJECT")} style={{ background: "#dc2626", color: "#fff" }}>
                            {isProcessing ? "Procesando…" : "Confirmar rechazo"}
                          </button>
                          <button className="btn" disabled={isProcessing} onClick={() => setRejectingId(null)} style={{ background: "#f1f5f9", color: "#64748b" }}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ── Tab: Salientes ── */}
        {tab === "salientes" && isAdmin && (
          <>
            {loadingOut ? (
              [1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 120, marginBottom: 14 }} />)
            ) : outgoing.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8" }}>
                <div style={{ marginBottom: 16 }}><CheckCircle size={48} color="#94a3b8" /></div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>No hay solicitudes salientes</div>
                <div style={{ fontSize: 13 }}>Usa el botón "Nueva solicitud saliente" para pedir una actualización, revisión o corrección a un usuario.</div>
              </div>
            ) : (
              outgoing.map((o) => {
                const tc  = OUT_TYPE_COLORS[o.type]   ?? { bg: "#f3f4f6", color: "#374151" };
                const sc  = OUT_STATUS_COLORS[o.status] ?? { bg: "#f3f4f6", color: "#374151" };
                const doc = o.file.nombreDocumento || o.file.name;
                const isExp = expanded.has(o.id);
                const isPendingApproval = o.status === "PENDING_APPROVAL";
                const isActive = ["PENDING","IN_PROGRESS","PENDING_APPROVAL"].includes(o.status);
                const isReviewing = reviewingId === o.id;

                return (
                  <div key={o.id} className="card" style={{ borderLeft: `4px solid ${tc.color}` }}>
                    {/* Card header */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <FileIcon mimeType={o.file.mimeType} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{doc}</span>
                          <span style={{ background: tc.bg, color: tc.color, borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{OUT_TYPE_LABELS[o.type]}</span>
                          <span style={{ background: sc.bg, color: sc.color, borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{OUT_STATUS_LABELS[o.status]}</span>
                        </div>
                        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                          {o.file.codigo && <span>Código: <b>{o.file.codigo}</b></span>}
                          {o.file.versionStr && <span>Versión actual: <b>{o.file.versionStr}</b></span>}
                          <span>{new Date(o.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}</span>
                        </div>
                      </div>
                      <button onClick={() => setExpanded((s) => { const n = new Set(s); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; })} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4 }}>
                        {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {/* Progress steps */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
                      {o.tasks.map((t, idx) => {
                        const done = t.status === "COMPLETED";
                        const current = !done && idx + 1 === o.currentStep && isActive;
                        return (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                            <div className="step-dot" style={{
                              background: done ? "#22c55e" : current ? p : "#e2e8f0",
                              color: done || current ? "#fff" : "#94a3b8",
                            }}>
                              {done ? <Check size={12} /> : idx + 1}
                            </div>
                            <span style={{ color: "#475569" }}>{t.assignedTo.name}</span>
                            {idx < o.tasks.length - 1 && <span style={{ color: "#d1d5db" }}>→</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Expanded details */}
                    {isExp && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
                        {o.instructions && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Instrucciones</div>
                            <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>{o.instructions}</div>
                          </div>
                        )}
                        {o.type === "CORRECCION" && o.correctionFields && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Campos a corregir</div>
                            <div style={{ fontSize: 13, color: "#374151", display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {(o.correctionFields as Record<string,boolean|string|null>).nombre    && <span style={{ background: "#e0f2fe", color: "#0369a1", borderRadius: 4, padding: "2px 8px" }}>Nombre</span>}
                              {(o.correctionFields as Record<string,boolean|string|null>).contenido && <span style={{ background: "#ede9fe", color: "#5b21b6", borderRadius: 4, padding: "2px 8px" }}>Contenido</span>}
                              {(o.correctionFields as Record<string,boolean|string|null>).area      && <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 4, padding: "2px 8px" }}>Área</span>}
                              {(o.correctionFields as Record<string,boolean|string|null>).carpeta   && <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 4, padding: "2px 8px" }}>Carpeta</span>}
                              {(o.correctionFields as Record<string,boolean|string|null>).otro      && <span style={{ background: "#f3f4f6", color: "#374151", borderRadius: 4, padding: "2px 8px" }}>Otro: {o.correctionFields.otro as string}</span>}
                            </div>
                          </div>
                        )}
                        {isPendingApproval && o.outcomeType && (
                          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", textTransform: "uppercase", marginBottom: 4 }}>Resultado enviado</div>
                            <div style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>{OUTCOME_LABELS[o.outcomeType] ?? o.outcomeType}</div>
                            {o.pendingVersionStr && <div style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>Versión propuesta: <b>{o.pendingVersionStr}</b></div>}
                            {o.pendingMetadata && Object.keys(o.pendingMetadata).length > 0 && (
                              <div style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>
                                Cambios de metadatos: {Object.keys(o.pendingMetadata as object).join(", ")}
                              </div>
                            )}
                          </div>
                        )}
                        {o.finalNotes && (
                          <div style={{ background: o.status === "APPROVED" ? "#f0fdf4" : "#fff1f2", border: `1px solid ${o.status === "APPROVED" ? "#bbf7d0" : "#fecdd3"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: o.status === "APPROVED" ? "#166534" : "#be123c", textTransform: "uppercase", marginBottom: 2 }}>Notas finales</div>
                            <div style={{ fontSize: 13 }}>{o.finalNotes}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {isPendingApproval && !isReviewing && (
                        <>
                          <button className="btn" onClick={() => { setReviewingId(o.id); setReviewNotes({}); setReviewVer({}); }} style={{ background: "#ede9fe", color: "#5b21b6" }}>
                            Revisar resultado
                          </button>
                          <button className="btn" disabled={outProcessing === o.id} onClick={() => cancelOutgoing(o.id)} style={{ background: "#f1f5f9", color: "#64748b", fontSize: 12 }}>
                            Cancelar solicitud
                          </button>
                        </>
                      )}
                      {isActive && !isPendingApproval && (
                        <button className="btn" disabled={outProcessing === o.id} onClick={() => cancelOutgoing(o.id)} style={{ background: "#f1f5f9", color: "#64748b", fontSize: 12 }}>
                          {outProcessing === o.id ? "Cancelando…" : "Cancelar solicitud"}
                        </button>
                      )}
                    </div>

                    {/* Review panel */}
                    {isReviewing && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
                        {o.outcomeType === "new_version" && (
                          <div style={{ marginBottom: 12 }}>
                            <label className="form-label">Etiqueta de versión (opcional)</label>
                            <input value={reviewVer[o.id] ?? o.pendingVersionStr ?? ""} onChange={(e) => setReviewVer((n) => ({ ...n, [o.id]: e.target.value }))} className="form-input" placeholder={o.pendingVersionStr ?? "v1.1"} style={{ maxWidth: 200 }} />
                            <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>Deja vacío para usar la etiqueta enviada por el usuario.</p>
                          </div>
                        )}
                        <label className="form-label">Notas (requeridas para rechazo)</label>
                        <textarea rows={3} value={reviewNotes[o.id] ?? ""} onChange={(e) => setReviewNotes((n) => ({ ...n, [o.id]: e.target.value }))} className="form-input" style={{ resize: "vertical", marginBottom: 10 }} placeholder="Observaciones para el equipo…" />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn" disabled={outProcessing === o.id} onClick={() => submitOutReview(o.id, "APPROVED")} style={{ background: "#dcfce7", color: "#166534" }}>
                            {outProcessing === o.id ? "Procesando…" : <><Check size={13} style={{ marginRight: 4 }} />Aprobar</>}
                          </button>
                          <button className="btn" disabled={outProcessing === o.id || !reviewNotes[o.id]?.trim()} onClick={() => submitOutReview(o.id, "REJECTED")} style={{ background: "#fee2e2", color: "#dc2626" }}>
                            <XIcon size={13} style={{ marginRight: 4 }} />Rechazar
                          </button>
                          <button className="btn" onClick={() => setReviewingId(null)} style={{ background: "#f1f5f9", color: "#64748b" }}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* ── Create outgoing request modal ── */}
      {showCreate && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="modal">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e293b" }}>Nueva solicitud saliente</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><XIcon size={20} /></button>
            </div>

            {/* File search */}
            <div style={{ marginBottom: 18 }}>
              <label className="form-label">Documento <span style={{ color: "#dc2626" }}>*</span></label>
              {selectedFile ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{selectedFile.nombreDocumento || selectedFile.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{selectedFile.codigo && `Código: ${selectedFile.codigo} · `}Versión: {selectedFile.versionStr ?? "—"}</div>
                  </div>
                  <button onClick={() => setSelectedFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><XIcon size={16} /></button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input
                    className="form-input"
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                    placeholder="Buscar por nombre o código…"
                    autoFocus
                  />
                  {fileSearch && (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, zIndex: 100, maxHeight: 240, overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
                      {filteredFiles.length === 0 ? (
                        <div style={{ padding: "12px 16px", fontSize: 13, color: "#94a3b8" }}>Sin resultados</div>
                      ) : filteredFiles.map((f) => (
                        <div key={f.id} onClick={() => { setSelectedFile(f); setFileSearch(""); }} style={{ padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", fontSize: 13 }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                          <div style={{ fontWeight: 600, color: "#1e293b" }}>{f.nombreDocumento || f.name}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{f.codigo && `${f.codigo} · `}v{f.versionStr ?? "—"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Type */}
            <div style={{ marginBottom: 18 }}>
              <label className="form-label">Tipo de solicitud <span style={{ color: "#dc2626" }}>*</span></label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["ACTUALIZACION","REVISION","CORRECCION"] as const).map((t) => (
                  <button key={t} className={`type-pill${outType === t ? " selected" : ""}`} onClick={() => setOutType(t)} style={{ borderColor: outType === t ? p : "#e2e8f0", background: outType === t ? "#eff6ff" : "#fff", color: outType === t ? p : "#374151" }}>
                    {OUT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "#64748b", margin: "6px 0 0" }}>
                {outType === "ACTUALIZACION" && "Pide al usuario que suba una versión más reciente del documento."}
                {outType === "REVISION" && "Pide al usuario que revise el documento e indique si requiere cambios."}
                {outType === "CORRECCION" && "Especifica qué campos o contenido deben corregirse."}
              </p>
            </div>

            {/* Correction fields (CORRECCION only) */}
            {outType === "CORRECCION" && (
              <div style={{ marginBottom: 18, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px" }}>
                <label className="form-label" style={{ marginBottom: 10 }}>Qué corregir <span style={{ color: "#dc2626" }}>*</span></label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(["nombre","contenido","area","carpeta"] as const).map((field) => {
                    const labels = { nombre: "Nombre del documento", contenido: "Contenido / archivo", area: "Área / departamento", carpeta: "Carpeta" };
                    return (
                      <label key={field} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={corrFields[field]} onChange={(e) => setCorrFields((f) => ({ ...f, [field]: e.target.checked }))} />
                        {labels[field]}
                        {field === "contenido" && corrFields.contenido && (
                          <span style={{ fontSize: 11, color: "#5b21b6", fontWeight: 600 }}>(el usuario deberá subir un archivo)</span>
                        )}
                      </label>
                    );
                  })}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!corrFields.otro.trim() || false} onChange={(e) => { if (!e.target.checked) setCorrFields((f) => ({ ...f, otro: "" })); }} />
                    Otro:
                    <input
                      value={corrFields.otro}
                      onChange={(e) => setCorrFields((f) => ({ ...f, otro: e.target.value }))}
                      className="form-input"
                      placeholder="Describe el campo a corregir…"
                      style={{ flex: 1, padding: "5px 10px" }}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div style={{ marginBottom: 18 }}>
              <label className="form-label">Instrucciones{outType === "CORRECCION" ? <span style={{ color: "#dc2626" }}> *</span> : " (opcional)"}</label>
              <textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} className="form-input" style={{ resize: "vertical" }} placeholder={
                outType === "ACTUALIZACION" ? "Describe qué versión se necesita…"
                : outType === "REVISION" ? "Describe el alcance de la revisión…"
                : "Explica detalladamente qué debe corregirse…"
              } />
            </div>

            {/* Assignees */}
            <div style={{ marginBottom: 18 }}>
              <label className="form-label">Asignado(s) <span style={{ color: "#dc2626" }}>*</span></label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {assignees.map((val, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", width: 46, flexShrink: 0 }}>Paso {idx + 1}</div>
                    <select
                      value={val}
                      onChange={(e) => setAssignees((prev) => prev.map((v, i) => i === idx ? e.target.value : v))}
                      className="form-select"
                      style={{ flex: 1 }}
                    >
                      <option value="">Seleccionar usuario…</option>
                      {allUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                    </select>
                    {assignees.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setAssignees((prev) => prev.filter((_, i) => i !== idx))}
                        style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: "#dc2626", flexShrink: 0 }}
                      >
                        <XIcon size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {assignees.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setAssignees((prev) => [...prev, ""])}
                    style={{ background: "none", border: "1px dashed #d1d5db", borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: "#64748b", fontSize: 13, display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
                  >
                    <Plus size={13} /> Agregar usuario
                  </button>
                )}
              </div>
            </div>

            {/* Due date */}
            <div style={{ marginBottom: 24 }}>
              <label className="form-label">Fecha límite (opcional)</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="form-input" style={{ maxWidth: 200 }} />
            </div>

            {createError && (
              <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#be123c" }}>
                {createError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setShowCreate(false)} style={{ background: "#f1f5f9", color: "#64748b" }}>Cancelar</button>
              <button className="btn" disabled={creating} onClick={submitCreate} style={{ background: p, color: "#fff" }}>
                {creating ? "Creando…" : "Crear solicitud"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
