"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as XLSX from "xlsx";
import FileIcon from "@/components/FileIcon";
import FileViewerModal, { isViewable, type ViewableFile } from "@/components/FileViewerModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LMFile {
  id: string;
  name: string;
  mimeType: string;
  folderId: string | null;
  folder: { id: string; name: string } | null;
  codigo: string | null;
  nombreDocumento: string | null;
  versionStr: string | null;
  fechaEmision: string | null;
  fechaRevision: string | null;
  fechaActualizacion: string | null;
  lastReviewedAt: string | null;
  lastAccessedAt: string | null;
  lastAccessedBy: { id: string; name: string } | null;
  lastEditedAt: string | null;
  lastEditedBy: { id: string; name: string } | null;
  controlCambios: string | null;
  encargadoDocumentoId: string | null;
  encargadoDocumento: { id: string; name: string; email: string } | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface FlowRequest {
  id: string;
  type: "ACTUALIZACION" | "REVISION" | "CORRECCION";
  status: string;
  instructions: string | null;
  outcomeType: string | null;
  pendingVersionStr: string | null;
  finalNotes: string | null;
  createdAt: string;
  finalReviewedAt: string | null;
  tasks: { id: string; stepOrder: number; status: string; assignedTo: { id: string; name: string; email: string } }[];
  createdBy: { id: string; name: string };
  finalReviewer: { id: string; name: string } | null;
}

interface Props {
  company: { name: string; primaryColor: string; logoUrl?: string | null };
  userRole: string;
}

interface EditForm {
  codigo: string;
  nombreDocumento: string;
  versionStr: string;
  fechaEmision: string;
  fechaRevision: string;
  fechaActualizacion: string;
  controlCambios: string;
  encargadoDocumentoId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toInputDate(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

const EMPTY_FORM: EditForm = {
  codigo: "", nombreDocumento: "", versionStr: "",
  fechaEmision: "", fechaRevision: "", fechaActualizacion: "",
  controlCambios: "", encargadoDocumentoId: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ListadoMaestroClient({ company, userRole }: Props) {
  const router = useRouter();
  const t  = useTranslations("listadoMaestro");
  const tc = useTranslations("common");
  const brand = company.primaryColor;
  const canEdit = userRole === "COMPANY_ADMIN" || userRole === "EDITOR";

  const STATUS_LABELS: Record<string, string> = {
    PENDING:          t("statusLabels.PENDING"),
    IN_PROGRESS:      t("statusLabels.IN_PROGRESS"),
    PENDING_APPROVAL: t("statusLabels.PENDING_APPROVAL"),
    APPROVED:         t("statusLabels.APPROVED"),
    REJECTED:         t("statusLabels.REJECTED"),
    CANCELLED:        t("statusLabels.CANCELLED"),
  };
  const TYPE_LABELS: Record<string, string> = {
    ACTUALIZACION: t("typeLabels.ACTUALIZACION"),
    REVISION:      t("typeLabels.REVISION"),
    CORRECCION:    t("typeLabels.CORRECCION"),
  };
  const OUTCOME_LABELS: Record<string, string> = {
    no_changes: t("outcomeLabels.no_changes"),
    new_version: t("outcomeLabels.new_version"),
    corrected:   t("outcomeLabels.corrected"),
  };

  // ── data ──────────────────────────────────────────────────────────────────
  const [files, setFiles] = useState<LMFile[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  // ── filters ───────────────────────────────────────────────────────────────
  const [fCodigo, setFCodigo] = useState("");
  const [fNombre, setFNombre] = useState("");
  const [fEncargado, setFEncargado] = useState("");
  const [fVersion, setFVersion] = useState("");
  const [fEmisionFrom, setFEmisionFrom] = useState("");
  const [fEmisionTo, setFEmisionTo] = useState("");
  const [fRevisionFrom, setFRevisionFrom] = useState("");
  const [fRevisionTo, setFRevisionTo] = useState("");
  const [fActFrom, setFActFrom] = useState("");
  const [fActTo, setFActTo] = useState("");

  // ── inline edit ───────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── review-flow modal ─────────────────────────────────────────────────────
  const [flowFile, setFlowFile] = useState<LMFile | null>(null);
  const [flowRequests, setFlowRequests] = useState<FlowRequest[]>([]);
  const [flowLoading, setFlowLoading] = useState(false);

  // ── sort ──────────────────────────────────────────────────────────────────
  type SortKey = "codigo" | "nombre" | "version" | "fechaEmision" | "fechaRevision" | "fechaActualizacion" | "encargado";
  const [sortKey, setSortKey] = useState<SortKey>("fechaEmision");
  const [sortAsc, setSortAsc] = useState(false);
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);

  // ── fetch ─────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fCodigo)      params.set("codigo", fCodigo);
    if (fNombre)      params.set("nombre", fNombre);
    if (fEncargado)   params.set("encargadoId", fEncargado);
    if (fVersion)     params.set("version", fVersion);
    if (fEmisionFrom) params.set("fechaEmisionFrom", fEmisionFrom);
    if (fEmisionTo)   params.set("fechaEmisionTo", fEmisionTo);
    if (fRevisionFrom) params.set("fechaRevisionFrom", fRevisionFrom);
    if (fRevisionTo)  params.set("fechaRevisionTo", fRevisionTo);
    if (fActFrom)     params.set("fechaActualizacionFrom", fActFrom);
    if (fActTo)       params.set("fechaActualizacionTo", fActTo);

    const res = await fetch(`/api/listado-maestro?${params}`);
    if (res.ok) {
      const d = await res.json();
      setFiles(d.files ?? []);
      setUsers(d.users ?? []);
    }
    setLoading(false);
  }, [fCodigo, fNombre, fEncargado, fVersion, fEmisionFrom, fEmisionTo, fRevisionFrom, fRevisionTo, fActFrom, fActTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── sorting ───────────────────────────────────────────────────────────────

  function toggleSort(key: SortKey) {
    if (sortKey === key) { setSortAsc((a) => !a); }
    else { setSortKey(key); setSortAsc(true); }
  }

  const sorted = [...files].sort((a, b) => {
    let av = "", bv = "";
    if (sortKey === "codigo")            { av = a.codigo ?? ""; bv = b.codigo ?? ""; }
    else if (sortKey === "nombre")       { av = a.nombreDocumento ?? a.name; bv = b.nombreDocumento ?? b.name; }
    else if (sortKey === "version")      { av = a.versionStr ?? ""; bv = b.versionStr ?? ""; }
    else if (sortKey === "encargado")    { av = a.encargadoDocumento?.name ?? ""; bv = b.encargadoDocumento?.name ?? ""; }
    else if (sortKey === "fechaEmision") { av = a.fechaEmision ?? ""; bv = b.fechaEmision ?? ""; }
    else if (sortKey === "fechaRevision") { av = a.fechaRevision ?? ""; bv = b.fechaRevision ?? ""; }
    else if (sortKey === "fechaActualizacion") { av = a.fechaActualizacion ?? ""; bv = b.fechaActualizacion ?? ""; }
    const cmp = av.localeCompare(bv);
    return sortAsc ? cmp : -cmp;
  });

  // ── edit ──────────────────────────────────────────────────────────────────

  function startEdit(f: LMFile) {
    setEditingId(f.id);
    setEditForm({
      codigo:               f.codigo ?? "",
      nombreDocumento:      f.nombreDocumento ?? "",
      versionStr:           f.versionStr ?? "",
      fechaEmision:         toInputDate(f.fechaEmision),
      fechaRevision:        toInputDate(f.fechaRevision),
      fechaActualizacion:   toInputDate(f.fechaActualizacion),
      controlCambios:       f.controlCambios ?? "",
      encargadoDocumentoId: f.encargadoDocumentoId ?? "",
    });
  }

  async function saveEdit(fileId: string) {
    const orig = files.find((f) => f.id === fileId);
    const body: Record<string, unknown> = {};

    const newCodigo = editForm.codigo || null;
    if (newCodigo !== (orig?.codigo ?? null)) body.codigo = newCodigo;

    const newNombre = editForm.nombreDocumento || null;
    if (newNombre !== (orig?.nombreDocumento ?? null)) body.nombreDocumento = newNombre;

    const newVer = editForm.versionStr || null;
    if (newVer !== (orig?.versionStr ?? null)) body.versionStr = newVer;

    const newFechaEm  = editForm.fechaEmision || null;
    const oldFechaEm  = toInputDate(orig?.fechaEmision ?? null) || null;
    if (newFechaEm !== oldFechaEm) body.fechaEmision = newFechaEm ? new Date(newFechaEm).toISOString() : null;

    const newFechaRev = editForm.fechaRevision || null;
    const oldFechaRev = toInputDate(orig?.fechaRevision ?? null) || null;
    if (newFechaRev !== oldFechaRev) body.fechaRevision = newFechaRev ? new Date(newFechaRev).toISOString() : null;

    const newFechaAct = editForm.fechaActualizacion || null;
    const oldFechaAct = toInputDate(orig?.fechaActualizacion ?? null) || null;
    if (newFechaAct !== oldFechaAct) body.fechaActualizacion = newFechaAct ? new Date(newFechaAct).toISOString() : null;

    const newCC = editForm.controlCambios || null;
    if (newCC !== (orig?.controlCambios ?? null)) body.controlCambios = newCC;

    const newEnc = editForm.encargadoDocumentoId || null;
    if (newEnc !== (orig?.encargadoDocumentoId ?? null)) body.encargadoDocumentoId = newEnc;

    if (Object.keys(body).length === 0) { setEditingId(null); return; }

    setSaving(true);
    const res = await fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setEditingId(null);
      fetchData();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Failed to save");
    }
  }

  // ── flow modal ────────────────────────────────────────────

  async function openFlowModal(f: LMFile) {
    setFlowFile(f);
    setFlowRequests([]);
    setFlowLoading(true);
    const res = await fetch(`/api/outgoing-requests?fileId=${f.id}`);
    if (res.ok) {
      const d = await res.json();
      setFlowRequests(d.outgoingRequests ?? []);
    }
    setFlowLoading(false);
  }

    // ── download ──────────────────────────────────────────────────────────────

  async function downloadFile(id: string) {
    const res = await fetch(`/api/files/${id}/download-url`);
    if (!res.ok) { alert("Could not get download link"); return; }
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  // ── Excel export ──────────────────────────────────────────────────────────

  function exportExcel() {
    const rows = sorted.map((f) => ({
      [t("excelColumns.codigo")]:         f.codigo ?? "",
      [t("excelColumns.nombre")]:         f.nombreDocumento ?? f.name,
      [t("excelColumns.version")]:        f.versionStr ?? "",
      [t("excelColumns.fechaEmision")]:   fmtDate(f.fechaEmision),
      [t("excelColumns.fechaRevision")]:  fmtDate(f.fechaRevision),
      [t("excelColumns.fechaActualizacion")]: fmtDate(f.fechaActualizacion),
      [t("excelColumns.controlCambios")]: f.controlCambios ?? "",
      [t("excelColumns.encargado")]:      f.encargadoDocumento?.name ?? "",
      [t("excelColumns.carpeta")]:        f.folder?.name ?? tc("carpeta"),
      [t("excelColumns.archivo")]:        f.name,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("header"));
    XLSX.writeFile(wb, `listado-maestro-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ── sort header ───────────────────────────────────────────────────────────

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        style={{
          ...th, cursor: "pointer", userSelect: "none",
          color: active ? brand : "#94a3b8",
          whiteSpace: "nowrap",
        }}
      >
        {label} {active ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  // ── clear filters ─────────────────────────────────────────────────────────

  function clearFilters() {
    setFCodigo(""); setFNombre(""); setFEncargado(""); setFVersion("");
    setFEmisionFrom(""); setFEmisionTo(""); setFRevisionFrom(""); setFRevisionTo("");
    setFActFrom(""); setFActTo("");
  }

  const hasFilters = fCodigo || fNombre || fEncargado || fVersion ||
    fEmisionFrom || fEmisionTo || fRevisionFrom || fRevisionTo || fActFrom || fActTo;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
    <div style={{ flex: 1, overflowY: "auto", background: "#f5f7fa" }}>

      {/* Section header */}
      <div style={{ background: brand, color: "#fff", padding: "12px 28px", position: "sticky", top: 0, zIndex: 10 }}>
        <strong style={{ fontSize: 16 }}>{t("header")}</strong>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 28px" }}>

        {/* ── Filters ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <strong style={{ fontSize: 13, color: "#374151" }}>{t("filters")}</strong>
            <div style={{ display: "flex", gap: 10 }}>
              {hasFilters && (
                <button onClick={clearFilters} style={{ ...ghostBtn, fontSize: 12 }}>{t("clearFilters")}</button>
              )}
              <button onClick={exportExcel} style={{ background: "#16a34a", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                ↓ {t("exportExcel")}
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div>
              <label style={lbl}>{tc("codigo")}</label>
              <input value={fCodigo} onChange={(e) => setFCodigo(e.target.value)} placeholder={t("filterPlaceholders.codigo")} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t("filterLabels.nombre")}</label>
              <input value={fNombre} onChange={(e) => setFNombre(e.target.value)} placeholder={t("filterPlaceholders.nombre")} style={inp} />
            </div>
            <div>
              <label style={lbl}>{tc("version")}</label>
              <input value={fVersion} onChange={(e) => setFVersion(e.target.value)} placeholder={t("filterPlaceholders.version")} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t("filterLabels.encargado")}</label>
              <select value={fEncargado} onChange={(e) => setFEncargado(e.target.value)} style={inp}>
                <option value="">{t("filterLabels.todos")}</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>{t("filterLabels.emisionFrom")}</label>
              <input type="date" value={fEmisionFrom} onChange={(e) => setFEmisionFrom(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t("filterLabels.emisionTo")}</label>
              <input type="date" value={fEmisionTo} onChange={(e) => setFEmisionTo(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t("filterLabels.revisionFrom")}</label>
              <input type="date" value={fRevisionFrom} onChange={(e) => setFRevisionFrom(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t("filterLabels.revisionTo")}</label>
              <input type="date" value={fRevisionTo} onChange={(e) => setFRevisionTo(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t("filterLabels.actFrom")}</label>
              <input type="date" value={fActFrom} onChange={(e) => setFActFrom(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t("filterLabels.actTo")}</label>
              <input type="date" value={fActTo} onChange={(e) => setFActTo(e.target.value)} style={inp} />
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              {loading ? t("loadingDocs") : t("docCount", { count: sorted.length })}
            </span>
          </div>

          {loading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>{t("loadingDocs")}</div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>
              <p style={{ margin: 0, fontSize: 15 }}>{t("emptyDocs")}</p>
              {hasFilters && <p style={{ margin: "8px 0 0", fontSize: 13 }}>{t("emptyFiltersHint")}</p>}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", background: "#f8fafc" }}>
                    <SortTh label={tc("codigo")} k="codigo" />
                    <SortTh label={t("tableHeaders.nombre")} k="nombre" />
                    <SortTh label={tc("version")} k="version" />
                    <SortTh label={t("tableHeaders.fechaEmision")} k="fechaEmision" />
                    <SortTh label={t("tableHeaders.fechaRevision")} k="fechaRevision" />
                    <SortTh label={t("tableHeaders.fechaActualizacion")} k="fechaActualizacion" />
                    <th style={th}>{t("tableHeaders.controlCambios")}</th>
                    <SortTh label={t("tableHeaders.encargado")} k="encargado" />
                    <th style={th}>{t("tableHeaders.acciones")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((f) => (
                    <>
                      <tr
                        key={f.id}
                        style={{
                          borderBottom: editingId === f.id ? "none" : "1px solid #f3f4f6",
                          background: editingId === f.id ? "#f0f9ff" : "transparent",
                        }}
                      >
                        <td style={td}>
                          <span style={{ fontWeight: 600, color: "#374151" }}>{f.codigo ?? <span style={{ color: "#d1d5db" }}>—</span>}</span>
                        </td>
                        <td style={{ ...td, maxWidth: 240 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <FileIcon mimeType={f.mimeType} size={15} />
                            <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {f.nombreDocumento ?? f.name}
                            </span>
                          </div>
                          {f.folder && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{f.folder.name}</div>}
                          {f.lastReviewedAt && (
                            <div style={{ fontSize: 10, color: "#7c3aed", marginTop: 2 }}>
                              {t("rowLabels.lastReview")} {fmtDate(f.lastReviewedAt)}
                            </div>
                          )}
                          {f.lastAccessedAt && (
                            <div style={{ fontSize: 10, color: "#0891b2", marginTop: 1 }}>
                              {t("rowLabels.lastAccess")} {fmtDate(f.lastAccessedAt)}{f.lastAccessedBy ? ` · ${f.lastAccessedBy.name}` : ""}
                            </div>
                          )}
                          {f.lastEditedAt && (
                            <div style={{ fontSize: 10, color: "#d97706", marginTop: 1 }}>
                              {t("rowLabels.lastEditor")} {f.lastEditedBy?.name ?? "—"} · {fmtDate(f.lastEditedAt)}
                            </div>
                          )}
                        </td>
                        <td style={td}>{f.versionStr ?? <span style={{ color: "#d1d5db" }}>—</span>}</td>
                        <td style={td}>{fmtDate(f.fechaEmision)}</td>
                        <td style={td}>
                          {f.fechaRevision ? (() => {
                            const today = new Date(); today.setHours(0, 0, 0, 0);
                            const overdue = new Date(f.fechaRevision) < today;
                            return overdue ? (
                              <div>
                                <span style={{ color: "#dc2626", fontWeight: 700 }}>{fmtDate(f.fechaRevision)}</span>
                                <span style={{ marginLeft: 5, background: "#fee2e2", color: "#dc2626", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 5px" }}>Vencido</span>
                              </div>
                            ) : (
                              <span>{fmtDate(f.fechaRevision)}</span>
                            );
                          })() : <span style={{ color: "#d1d5db" }}>—</span>}
                        </td>
                        <td style={td}>{fmtDate(f.fechaActualizacion)}</td>
                        <td style={{ ...td, maxWidth: 180 }}>
                          {f.controlCambios ? (
                            <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {f.controlCambios}
                            </span>
                          ) : <span style={{ color: "#d1d5db" }}>—</span>}
                        </td>
                        <td style={td}>
                          {f.encargadoDocumento ? (
                            <span title={f.encargadoDocumento.email}>{f.encargadoDocumento.name}</span>
                          ) : <span style={{ color: "#d1d5db" }}>—</span>}
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                            <button
                              onClick={() => isViewable(f.mimeType) ? setViewerFile({ id: f.id, name: f.nombreDocumento ?? f.name, mimeType: f.mimeType }) : downloadFile(f.id)}
                              style={{ ...ghostBtn, fontSize: 11, padding: "3px 8px", ...(isViewable(f.mimeType) ? { color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe" } : {}) }}
                            >{t("actions.view")}</button>
                            <button onClick={() => openFlowModal(f)} style={{ ...ghostBtn, fontSize: 11, padding: "3px 8px", color: "#5b21b6" }}>{t("actions.flow")}</button>
                            {canEdit && (
                              <button
                                onClick={() => editingId === f.id ? setEditingId(null) : startEdit(f)}
                                style={{ ...ghostBtn, fontSize: 11, padding: "3px 8px", color: editingId === f.id ? "#dc2626" : "#374151" }}
                              >
                                {editingId === f.id ? tc("cancel") : t("actions.edit")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── Inline edit row ── */}
                      {editingId === f.id && (
                        <tr key={`${f.id}-edit`} style={{ borderBottom: "1px solid #f3f4f6", background: "#f0f9ff" }}>
                          <td colSpan={9} style={{ padding: "16px 20px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                              <div>
                                <label style={lbl}>{tc("codigo")}</label>
                                <input value={editForm.codigo} onChange={(e) => setEditForm({ ...editForm, codigo: e.target.value })} style={inp} placeholder="DOC-001" />
                              </div>
                              <div>
                                <label style={lbl}>{t("filterLabels.nombre")}</label>
                                <input value={editForm.nombreDocumento} onChange={(e) => setEditForm({ ...editForm, nombreDocumento: e.target.value })} style={inp} placeholder={f.name} />
                              </div>
                              <div>
                                <label style={lbl}>{tc("version")}</label>
                                <input value={editForm.versionStr} onChange={(e) => setEditForm({ ...editForm, versionStr: e.target.value })} style={inp} placeholder="v1.0" />
                              </div>
                              <div>
                                <label style={lbl}>{t("filterLabels.encargado")}</label>
                                <select value={editForm.encargadoDocumentoId} onChange={(e) => setEditForm({ ...editForm, encargadoDocumentoId: e.target.value })} style={inp}>
                                  <option value="">{t("editLabels.sinAsignar")}</option>
                                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={lbl}>{t("tableHeaders.fechaEmision")}</label>
                                <input type="date" value={editForm.fechaEmision} onChange={(e) => setEditForm({ ...editForm, fechaEmision: e.target.value })} style={inp} />
                              </div>
                              <div>
                                <label style={lbl}>{t("tableHeaders.fechaRevision")}</label>
                                <input type="date" value={editForm.fechaRevision} onChange={(e) => setEditForm({ ...editForm, fechaRevision: e.target.value })} style={inp} />
                              </div>
                              <div>
                                <label style={lbl}>{t("tableHeaders.fechaActualizacion")}</label>
                                <input type="date" value={editForm.fechaActualizacion} onChange={(e) => setEditForm({ ...editForm, fechaActualizacion: e.target.value })} style={inp} />
                              </div>
                              <div style={{ gridColumn: "span 2" }}>
                                <label style={lbl}>{t("tableHeaders.controlCambios")}</label>
                                <textarea
                                  value={editForm.controlCambios}
                                  onChange={(e) => setEditForm({ ...editForm, controlCambios: e.target.value })}
                                  rows={3}
                                  style={{ ...inp, resize: "vertical" }}
                                  placeholder={t("filterPlaceholders.changeLogs")}
                                />
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                              <button
                                onClick={() => saveEdit(f.id)}
                                disabled={saving}
                                style={{ background: brand, color: "#fff", border: "none", padding: "7px 18px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
                              >
                                {saving ? t("actions.saving") : t("actions.save")}
                              </button>
                              <button onClick={() => setEditingId(null)} style={ghostBtn}>{tc("cancel")}</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* ── Review-flow modal ── */}
    {flowFile && (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
        onClick={(e) => { if (e.target === e.currentTarget) setFlowFile(null); }}
      >
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "88vh", overflowY: "auto", padding: 28, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1e293b" }}>{t("flowModal.title")}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                {flowFile.nombreDocumento ?? flowFile.name}{flowFile.codigo ? ` · ${flowFile.codigo}` : ""}
              </p>
            </div>
            <button onClick={() => setFlowFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 20, lineHeight: 1 }}>✕</button>
          </div>

          {flowLoading ? (
            <p style={{ textAlign: "center", color: "#94a3b8", padding: "40px 0" }}>{t("flowModal.loading")}</p>
          ) : flowRequests.length === 0 ? (
            <p style={{ textAlign: "center", color: "#94a3b8", padding: "40px 0", fontSize: 14 }}>{t("flowModal.empty")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[...flowRequests].reverse().map((r) => {
                const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
                  ACTUALIZACION: { bg: "#dbeafe", color: "#1e40af" },
                  REVISION:      { bg: "#ede9fe", color: "#5b21b6" },
                  CORRECCION:    { bg: "#fef3c7", color: "#92400e" },
                };
                const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
                  PENDING:          { bg: "#f1f5f9", color: "#64748b" },
                  IN_PROGRESS:      { bg: "#fef3c7", color: "#92400e" },
                  PENDING_APPROVAL: { bg: "#ede9fe", color: "#5b21b6" },
                  APPROVED:         { bg: "#dcfce7", color: "#166534" },
                  REJECTED:         { bg: "#fee2e2", color: "#dc2626" },
                  CANCELLED:        { bg: "#f3f4f6", color: "#94a3b8" },
                };
                const typeColor = TYPE_COLORS[r.type] ?? { bg: "#f3f4f6", color: "#374151" };
                const sc = STATUS_COLORS[r.status] ?? { bg: "#f3f4f6", color: "#374151" };
                return (
                  <div key={r.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                      <span style={{ background: typeColor.bg, color: typeColor.color, borderRadius: 5, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>{TYPE_LABELS[r.type] ?? r.type}</span>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 5, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>{STATUS_LABELS[r.status] ?? r.status}</span>
                      {r.pendingVersionStr && r.status === "APPROVED" && (
                        <code style={{ background: "#f0fdf4", color: "#166534", padding: "1px 7px", borderRadius: 4, fontSize: 11 }}>{r.pendingVersionStr}</code>
                      )}
                      <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>{fmtDate(r.createdAt)}</span>
                    </div>

                    {r.instructions && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 }}>{t("flowModal.changeTask")}</div>
                        <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap", background: "#f8fafc", borderRadius: 6, padding: "8px 10px" }}>{r.instructions}</div>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: r.finalNotes ? 8 : 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{t("flowModal.assigned")}</span>
                      {r.tasks.map((task) => (
                        <span key={task.id} style={{
                          background: task.status === "COMPLETED" ? "#dcfce7" : "#f1f5f9",
                          color: task.status === "COMPLETED" ? "#166534" : "#475569",
                          borderRadius: 4, padding: "2px 8px", fontSize: 12,
                        }}>
                          {task.stepOrder}. {task.assignedTo.name}
                        </span>
                      ))}
                    </div>

                    {r.outcomeType && r.status === "APPROVED" && (
                      <div style={{ fontSize: 12, color: "#166534", marginTop: 6 }}>
                        {t("flowModal.result")} <b>{OUTCOME_LABELS[r.outcomeType] ?? r.outcomeType}</b>
                        {r.finalReviewedAt && <span style={{ color: "#94a3b8", marginLeft: 8 }}>· {t("flowModal.approvedOn")} {fmtDate(r.finalReviewedAt)}</span>}
                      </div>
                    )}

                    {r.finalNotes && (
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, background: "#f8fafc", borderRadius: 6, padding: "6px 10px" }}>
                        <b>{t("flowModal.finalNote")}</b> {r.finalNotes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    )}
    <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const headerBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
  padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13,
};

const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8",
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
};

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 10px", border: "1px solid #d1d5db",
  borderRadius: 6, fontSize: 13, boxSizing: "border-box",
};

const th: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontSize: 11,
  fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5,
};

const td: React.CSSProperties = {
  padding: "11px 14px", verticalAlign: "top", color: "#374151",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent", color: "#374151", border: "1px solid #d1d5db",
  padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
};
