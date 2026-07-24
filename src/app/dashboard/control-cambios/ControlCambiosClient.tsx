"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Archive, RotateCcw, Eye, Paperclip, Trash2, X, Upload, Loader2, FileText } from "lucide-react";
import FileIcon from "@/components/FileIcon";

interface ChangeEntry {
  id: string;
  tipo: string;
  tipoLabel: string;
  documento: string | null;
  codigo: string | null;
  fileId: string | null;
  quien: string | null;
  fecha: string;
  detalle: string | null;
  version?: string | null;
  estado?: string;
}

interface RevFile {
  id: string;
  name: string;
  codigo: string | null;
  nombreDocumento: string | null;
  fechaRevision: string;
  encargadoDocumento: { name: string; email: string } | null;
  folder: { name: string } | null;
}

interface RevAsignada {
  id: string;
  type: string;
  status: string;
  instructions: string | null;
  currentStep: number;
  totalSteps: number;
  createdAt: string;
  file: {
    id: string;
    name: string;
    codigo: string | null;
    nombreDocumento: string | null;
    fechaRevision: string | null;
    versionStr: string | null;
    folder: { name: string } | null;
  };
  tasks: { stepOrder: number; status: string; assignedTo: { id: string; name: string } }[];
  createdBy: { id: string; name: string };
}

const OUT_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  REVISION:     { bg: "#ede9fe", color: "#5b21b6" },
  ACTUALIZACION: { bg: "#dbeafe", color: "#1e40af" },
  CORRECCION:   { bg: "#fef3c7", color: "#92400e" },
};

interface ObsoleteFile {
  id: string; name: string; nombreDocumento: string | null; codigo: string | null;
  mimeType: string; size: number; tipoDocumento: string | null; versionStr: string | null;
  departamento: string | null; createdAt: string; updatedAt: string;
  comparisonStorageKey: string | null; comparisonName: string | null;
  folder: { id: string; name: string } | null;
  uploadedBy: { id: string; name: string } | null;
  lastEditedBy: { id: string; name: string } | null;
}

interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string; logoUrl: string | null };
  userRole: string;
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const TIPO_COLORS: Record<string, string> = {
  FILE_UPLOAD:              "#2563eb",
  FILE_DELETE:              "#dc2626",
  FILE_REVIEW_COMPLETE:     "#7c3aed",
  FILE_REVIEW_UPDATE:       "#d97706",
  FILE_METADATA_UPDATE:     "#0891b2",
  FILE_STATUS_UPDATE:       "#16a34a",
  FILE_OBSOLETE:            "#64748b",
  CHANGE_REQUEST_APPROVED:  "#16a34a",
  CHANGE_REQUEST_REJECTED:  "#dc2626",
  CR_NEW_UPLOAD:            "#2563eb",
  CR_EDIT_METADATA:         "#d97706",
  CR_REPLACE_FILE:          "#7c3aed",
  CR_DELETE:                "#dc2626",
  OR_ACTUALIZACION:         "#2563eb",
  OR_REVISION:              "#7c3aed",
  OR_CORRECCION:            "#d97706",
  CR_REVISION_DATE_CHANGE:        "#0891b2",
  CR_OTHER:                       "#64748b",
  OUTGOING_REQUEST_RETURNED:      "#f97316",
  OUTGOING_REQUEST_CORRECTED:     "#0891b2",
};

export default function ControlCambiosClient({ company, userRole }: Props) {
  const router = useRouter();
  const brand  = company.primaryColor;
  const isAdmin = userRole === "COMPANY_ADMIN";
  const t  = useTranslations("controlCambios");
  const tc = useTranslations("common");

  const OUT_TYPE_LABELS: Record<string, string> = {
    REVISION:      t("outTypes.REVISION"),
    ACTUALIZACION: t("outTypes.ACTUALIZACION"),
    CORRECCION:    t("outTypes.CORRECCION"),
  };

  const [activeTab, setActiveTab] = useState<"cambios" | "revisiones" | "archivo">("cambios");

  // ── Registro de Cambios state ──
  const [entries, setEntries]   = useState<ChangeEntry[]>([]);
  const [total,   setTotal]     = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading]   = useState(true);

  const [q,        setQ]        = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [fCodigo,  setFCodigo]  = useState("");
  const [fNombre,  setFNombre]  = useState("");
  const [fTipo,    setFTipo]    = useState("");
  const [page,     setPage]     = useState(1);

  // ── Próximas Revisiones state ──
  const [revFiles,    setRevFiles]    = useState<RevFile[]>([]);
  const [revVencidas, setRevVencidas] = useState<RevFile[]>([]);
  const [revAsignadas, setRevAsignadas] = useState<RevAsignada[]>([]);
  const [revLoading,  setRevLoading]  = useState(false);
  const [revLoaded,   setRevLoaded]   = useState(false);

  // ── Archivo Histórico state ──
  const [archFiles,    setArchFiles]    = useState<ObsoleteFile[]>([]);
  const [archLoading,  setArchLoading]  = useState(false);
  const [archLoaded,   setArchLoaded]   = useState(false);
  const [archSearch,   setArchSearch]   = useState("");
  const [archRestoring, setArchRestoring] = useState<string | null>(null);
  const [compModal,    setCompModal]    = useState<ObsoleteFile | null>(null);
  const [compFile,     setCompFile]     = useState<File | null>(null);
  const [compUploading, setCompUploading] = useState(false);
  const [compError,    setCompError]    = useState<string | null>(null);
  const compInputRef = useRef<HTMLInputElement>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (q)       p.set("q", q);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo)   p.set("dateTo", dateTo);
    if (fCodigo)  p.set("codigo", fCodigo);
    if (fNombre)  p.set("nombre", fNombre);
    if (fTipo)    p.set("tipo", fTipo);
    p.set("page", String(page));
    const res = await fetch(`/api/control-cambios?${p}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
      setPageCount(data.pageCount);
    }
    setLoading(false);
  }, [q, dateFrom, dateTo, fCodigo, fNombre, fTipo, page]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { fetchRevisiones(); }, []);

  function applySearch() { setPage(1); fetchEntries(); }
  function clearFilters() { setQ(""); setDateFrom(""); setDateTo(""); setFCodigo(""); setFNombre(""); setFTipo(""); setPage(1); }

  async function fetchRevisiones() {
    setRevLoading(true);
    const res = await fetch("/api/control-cambios/revisiones");
    if (res.ok) {
      const data = await res.json();
      const all = (data.programadas as RevFile[]).filter((f) => f.fechaRevision);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const vencidas  = all.filter((f) => new Date(f.fechaRevision) < today);
      const proximas  = all.filter((f) => new Date(f.fechaRevision) >= today);
      vencidas.sort((a, b) => new Date(a.fechaRevision).getTime() - new Date(b.fechaRevision).getTime());
      proximas.sort((a, b) => new Date(a.fechaRevision).getTime() - new Date(b.fechaRevision).getTime());
      setRevVencidas(vencidas);
      setRevFiles(proximas);
      setRevAsignadas(data.asignadas ?? []);
    }
    setRevLoading(false);
    setRevLoaded(true);
  }

  async function fetchArchivo() {
    setArchLoading(true);
    const res = await fetch("/api/archivo-historico");
    if (res.ok) setArchFiles((await res.json()).files ?? []);
    setArchLoading(false);
    setArchLoaded(true);
  }

  async function archRestore(fileId: string, docName: string) {
    if (!confirm(`¿Restaurar "${docName}" como documento activo?`)) return;
    setArchRestoring(fileId);
    await fetch(`/api/files/${fileId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REVIEWED" }),
    });
    setArchFiles((prev) => prev.filter((f) => f.id !== fileId));
    setArchRestoring(null);
  }

  async function viewComparison(fileId: string) {
    const res = await fetch(`/api/files/${fileId}/comparison`);
    if (!res.ok) { alert("Error al obtener el documento comparativo."); return; }
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  async function deleteComparison(fileId: string) {
    if (!confirm("¿Quitar el documento comparativo?")) return;
    await fetch(`/api/files/${fileId}/comparison`, { method: "DELETE" });
    setArchFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, comparisonStorageKey: null, comparisonName: null } : f));
  }

  async function handleCompUpload() {
    if (!compModal || !compFile) { setCompError(t("errors.selectFile")); return; }
    setCompUploading(true); setCompError(null);
    try {
      const urlRes = await fetch(`/api/files/${compModal.id}/comparison`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: compFile.name, mimeType: compFile.type || "application/octet-stream", size: compFile.size }),
      });
      if (!urlRes.ok) throw new Error((await urlRes.json().catch(() => ({}))).error ?? t("errors.uploadUrlError"));
      const { uploadUrl, storageKey } = await urlRes.json();
      const putRes = await fetch(uploadUrl, { method: "PUT", body: compFile, headers: { "Content-Type": compFile.type || "application/octet-stream" } });
      if (!putRes.ok) throw new Error(t("errors.uploadError"));
      const saveRes = await fetch(`/api/files/${compModal.id}/comparison`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey, name: compFile.name }),
      });
      if (!saveRes.ok) throw new Error(t("errors.saveComparisonError"));
      setArchFiles((prev) => prev.map((f) => f.id === compModal.id ? { ...f, comparisonStorageKey: storageKey, comparisonName: compFile!.name } : f));
      setCompModal(null); setCompFile(null);
    } catch (err) {
      setCompError(err instanceof Error ? err.message : t("errors.unexpected"));
    } finally {
      setCompUploading(false);
    }
  }

  function handleTabChange(tab: "cambios" | "revisiones" | "archivo") {
    setActiveTab(tab);
    if (tab === "revisiones" && !revLoaded) fetchRevisiones();
    if (tab === "archivo" && !archLoaded) fetchArchivo();
  }

  function groupByMonth(files: RevFile[]): { label: string; docs: RevFile[] }[] {
    const map = new Map<string, RevFile[]>();
    for (const f of files) {
      const d = new Date(f.fechaRevision);
      const key = d.toLocaleDateString("es-CR", { month: "long", year: "numeric" });
      const arr = map.get(key) ?? [];
      arr.push(f);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([label, docs]) => ({ label, docs }));
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

  const revGroups = groupByMonth(revFiles);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f1f5f9", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      {/* Section header */}
      <div style={{ background: brand, color: "#fff", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ padding: "12px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 16 }}>{t("header")}</strong>
          {activeTab === "cambios" && <span style={{ fontSize: 12, opacity: 0.75 }}>{total} {t("records")}</span>}
          {activeTab === "archivo" && !archLoading && <span style={{ fontSize: 12, opacity: 0.75 }}>{archFiles.length} {archFiles.length !== 1 ? t("docPlural") : t("docSingular")} {archFiles.length !== 1 ? t("obsoletePlural") : t("obsoleteSingular")}</span>}
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.15)", paddingLeft: 16 }}>
          {([
            { key: "cambios"  as const, label: t("tabs.registro"), badge: 0 },
            ...(isAdmin ? [{ key: "revisiones" as const, label: t("tabs.proximas"), badge: revVencidas.length + revFiles.length + revAsignadas.length }] : []),
            { key: "archivo" as const, label: t("tabs.archivo"), badge: 0 },
          ]).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                style={{
                  background: isActive ? "rgba(255,255,255,0.15)" : "transparent",
                  color: "#fff",
                  border: "none",
                  borderBottom: isActive ? "2px solid #fff" : "2px solid transparent",
                  padding: "9px 20px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 400,
                  opacity: isActive ? 1 : 0.75,
                  transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 7,
                }}
              >
                {tab.label}
                {tab.badge > 0 && (
                  <span style={{ background: "rgba(255,255,255,0.25)", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Registro de Cambios tab ── */}
      {activeTab === "cambios" && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

          {/* Filters */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
              <div style={{ flex: "2 1 200px" }}>
                <label style={labelStyle}>{t("filters.searchPlaceholder")}</label>
                <input
                  type="text" value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applySearch()}
                  placeholder={t("filters.searchHint")}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label style={labelStyle}>{tc("codigo")}</label>
                <input type="text" value={fCodigo} onChange={(e) => setFCodigo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applySearch()} placeholder={t("filters.codigoPlaceholder")} style={inputStyle} />
              </div>
              <div style={{ flex: "2 1 180px" }}>
                <label style={labelStyle}>{tc("nombre")}</label>
                <input type="text" value={fNombre} onChange={(e) => setFNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applySearch()} placeholder={t("filters.nombrePlaceholder")} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "2 1 200px" }}>
                <label style={labelStyle}>{t("table.tipoCambio")}</label>
                <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={inputStyle}>
                  <option value="">Todos</option>
                  <optgroup label="Actividad de archivos">
                    <option value="FILE_UPLOAD">Archivo subido</option>
                    <option value="FILE_DELETE">Archivo eliminado</option>
                    <option value="FILE_REVIEW_COMPLETE">Revisión completada</option>
                    <option value="FILE_REVIEW_UPDATE">Revisión programada</option>
                    <option value="FILE_METADATA_UPDATE">Metadatos actualizados</option>
                    <option value="FILE_STATUS_UPDATE">Estado actualizado</option>
                    <option value="FILE_OBSOLETE">Archivado como obsoleto</option>
                    <option value="OUTGOING_REQUEST_RETURNED">Entrega devuelta</option>
                    <option value="OUTGOING_REQUEST_CORRECTED">Entrega corregida</option>
                  </optgroup>
                  <optgroup label="Solicitudes de cambio">
                    <option value="CR_NEW_UPLOAD">Archivo nuevo</option>
                    <option value="CR_EDIT_METADATA">Edición de metadatos</option>
                    <option value="CR_DELETE">Solicitud de eliminación</option>
                    <option value="CR_REVISION_DATE_CHANGE">Cambio de fecha de revisión</option>
                  </optgroup>
                  <optgroup label="Entregas aprobadas">
                    <option value="OR_ACTUALIZACION">Actualización aprobada</option>
                    <option value="OR_REVISION">Revisión aprobada</option>
                    <option value="OR_CORRECCION">Corrección aprobada</option>
                  </optgroup>
                </select>
              </div>
              <div style={{ flex: "1 1 130px" }}>
                <label style={labelStyle}>{tc("from")}</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: "1 1 130px" }}>
                <label style={labelStyle}>{tc("to")}</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={applySearch} style={{ background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                  {tc("search")}
                </button>
                <button onClick={clearFilters} style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
                  {tc("clear")}
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            {loading ? (
              <p style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>{tc("loading")}</p>
            ) : entries.length === 0 ? (
              <p style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>{t("emptyRegistro")}</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {[t("table.fecha"), t("table.tipoCambio"), tc("documento"), tc("codigo"), tc("version"), t("table.quien"), t("table.descripcion")].map((h) => (
                      <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const color = TIPO_COLORS[e.tipo] ?? "#64748b";
                    return (
                      <tr key={e.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                        <td style={{ padding: "11px 18px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                          <div>{fmtDate(e.fecha)}</div>
                          <div style={{ color: "#94a3b8", fontSize: 11 }}>{fmtTime(e.fecha)}</div>
                        </td>
                        <td style={{ padding: "11px 18px" }}>
                          <span style={{
                            background: `${color}18`, color,
                            padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                          }}>
                            {e.tipoLabel}
                          </span>
                          {e.estado && (
                            <span style={{
                              marginLeft: 6,
                              background: e.estado === "APPROVED" ? "#dcfce7" : "#fee2e2",
                              color: e.estado === "APPROVED" ? "#166534" : "#dc2626",
                              padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                            }}>
                              {e.estado === "APPROVED" ? tc("aprobado") : tc("rechazado")}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "11px 18px", fontSize: 13, color: "#374151", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.documento ?? <span style={{ color: "#d1d5db" }}>—</span>}
                        </td>
                        <td style={{ padding: "11px 18px" }}>
                          {e.codigo ? (
                            <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, fontSize: 12, color: "#374151" }}>
                              {e.codigo}
                            </code>
                          ) : (
                            <span style={{ color: "#d1d5db" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "11px 18px" }}>
                          {e.version ? (
                            <code style={{ background: "#f0fdf4", color: "#166534", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>
                              {e.version}
                            </code>
                          ) : (
                            <span style={{ color: "#d1d5db" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "11px 18px", fontSize: 13, color: "#374151" }}>
                          {e.quien ?? <span style={{ color: "#d1d5db" }}>{tc("sistema")}</span>}
                        </td>
                        <td style={{ padding: "10px 18px", maxWidth: 300 }}>
                          {e.detalle ? (
                            <span style={{
                              fontSize: 12,
                              color: "#475569",
                              lineHeight: 1.55,
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              wordBreak: "break-word",
                            }} title={e.detalle}>
                              {e.detalle}
                            </span>
                          ) : (
                            <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn(page === 1)}>{t("prev")}</button>
              <span style={{ padding: "6px 12px", fontSize: 13, color: "#64748b" }}>{t("pag")} {page} {tc("de")} {pageCount}</span>
              <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} style={pageBtn(page === pageCount)}>{t("next")}</button>
            </div>
          )}
        </div>
      )}

      {/* ── Próximas Revisiones tab ── */}
      {activeTab === "revisiones" && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
          {revLoading ? (
            <p style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>{tc("loading")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

              {/* ── Solicitudes de revisión asignadas ── */}
              {revAsignadas.length > 0 && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ background: "#7c3aed", color: "#fff", borderRadius: 6, padding: "4px 14px", fontSize: 13, fontWeight: 700 }}>
                      {t("revisionesAsignadas")}
                    </div>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{revAsignadas.length} {revAsignadas.length !== 1 ? t("requestPlural") : t("requestSingular")}</span>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                          {[tc("documento"), tc("codigo"), t("tableRevisiones.tipo"), t("tableRevisiones.asignado"), tc("paso"), t("tableRevisiones.instrucciones")].map((h) => (
                            <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {revAsignadas.map((r) => {
                          const currentTask = r.tasks.find((t) => t.stepOrder === r.currentStep);
                          const tc = OUT_TYPE_COLORS[r.type] ?? { bg: "#f3f4f6", color: "#374151" };
                          return (
                            <tr key={r.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                              <td style={{ padding: "11px 16px", fontSize: 13, color: "#1e293b", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.file.nombreDocumento || r.file.name}
                                {r.file.folder && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{r.file.folder.name}</div>}
                              </td>
                              <td style={{ padding: "11px 16px" }}>
                                {r.file.codigo
                                  ? <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{r.file.codigo}</code>
                                  : <span style={{ color: "#d1d5db" }}>—</span>
                                }
                              </td>
                              <td style={{ padding: "11px 16px" }}>
                                <span style={{ background: tc.bg, color: tc.color, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>
                                  {OUT_TYPE_LABELS[r.type] ?? r.type}
                                </span>
                              </td>
                              <td style={{ padding: "11px 16px", fontSize: 13, color: "#374151" }}>
                                {currentTask?.assignedTo.name ?? <span style={{ color: "#d1d5db" }}>—</span>}
                              </td>
                              <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                                {r.currentStep} / {r.totalSteps}
                              </td>
                              <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.instructions ?? <span style={{ color: "#d1d5db" }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Revisiones VENCIDAS ── */}
              {revVencidas.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ background: "#dc2626", color: "#fff", borderRadius: 6, padding: "4px 14px", fontSize: 13, fontWeight: 700 }}>
                      ⚠ Revisiones Vencidas
                    </div>
                    <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{revVencidas.length} {revVencidas.length !== 1 ? t("docPlural") : t("docSingular")}</span>
                  </div>
                  <div style={{ background: "#fff", border: "2px solid #fca5a5", borderRadius: 10, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #fee2e2", background: "#fff5f5" }}>
                          {[t("tableUpcoming.fecha"), tc("documento"), tc("codigo"), t("tableUpcoming.responsable"), t("tableUpcoming.carpeta")].map((h) => (
                            <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {revVencidas.map((f) => {
                          const today = new Date(); today.setHours(0, 0, 0, 0);
                          const daysOverdue = Math.ceil((today.getTime() - new Date(f.fechaRevision).getTime()) / 86_400_000);
                          return (
                            <tr key={f.id} style={{ borderBottom: "1px solid #fee2e2", background: daysOverdue > 30 ? "#fef2f2" : "#fff" }}>
                              <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>{fmtDate(f.fechaRevision)}</div>
                                <div style={{ fontSize: 11, color: "#dc2626", marginTop: 1, fontWeight: 600 }}>
                                  Vencido hace {daysOverdue} {daysOverdue === 1 ? "día" : "días"}
                                </div>
                              </td>
                              <td style={{ padding: "11px 16px", fontSize: 13, color: "#1e293b", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {f.nombreDocumento || f.name}
                              </td>
                              <td style={{ padding: "11px 16px" }}>
                                {f.codigo
                                  ? <code style={{ background: "#fee2e2", padding: "2px 7px", borderRadius: 4, fontSize: 12, color: "#dc2626" }}>{f.codigo}</code>
                                  : <span style={{ color: "#d1d5db" }}>—</span>
                                }
                              </td>
                              <td style={{ padding: "11px 16px", fontSize: 13, color: "#374151" }}>
                                {f.encargadoDocumento?.name ?? <span style={{ color: "#d1d5db" }}>—</span>}
                              </td>
                              <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b" }}>
                                {f.folder?.name ?? <span style={{ color: "#d1d5db" }}>{t("root")}</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Revisiones programadas ── */}
              {revFiles.length === 0 && revVencidas.length === 0 && revAsignadas.length === 0 ? (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "#94a3b8" }}>
                  <p style={{ fontSize: 15, margin: 0 }}>{t("emptyUpcoming")}</p>
                </div>
              ) : revFiles.length > 0 && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ background: brand, color: "#fff", borderRadius: 6, padding: "4px 14px", fontSize: 13, fontWeight: 700 }}>
                      {t("upcomingTitle")}
                    </div>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{revFiles.length} {revFiles.length !== 1 ? t("docPlural") : t("docSingular")}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {revGroups.map(({ label, docs }) => {
                      const monthDate = new Date(docs[0].fechaRevision);
                      const isCurrentMonth =
                        monthDate.getMonth() === new Date().getMonth() &&
                        monthDate.getFullYear() === new Date().getFullYear();
                      return (
                        <div key={label}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                            <div style={{
                              background: isCurrentMonth ? "#d97706" : "#64748b",
                              color: "#fff", borderRadius: 5, padding: "3px 12px",
                              fontSize: 12, fontWeight: 700, textTransform: "capitalize",
                            }}>
                              {label}
                            </div>
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>{docs.length} {docs.length !== 1 ? t("docPlural") : t("docSingular")}</span>
                          </div>
                          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                                  {[t("tableUpcoming.fecha"), tc("documento"), tc("codigo"), t("tableUpcoming.responsable"), t("tableUpcoming.carpeta")].map((h) => (
                                    <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {docs.map((f) => {
                                  const rev = new Date(f.fechaRevision);
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  const daysLeft = Math.ceil((rev.getTime() - today.getTime()) / 86_400_000);
                                  const urgent = daysLeft <= 7;
                                  return (
                                    <tr key={f.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                                      <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: urgent ? "#dc2626" : "#374151" }}>
                                          {fmtDate(f.fechaRevision)}
                                        </div>
                                        <div style={{ fontSize: 11, color: urgent ? "#dc2626" : "#94a3b8", marginTop: 1 }}>
                                          {daysLeft === 0 ? t("today") : daysLeft === 1 ? t("tomorrow") : `${t("inDays")} ${daysLeft} ${t("days")}`}
                                        </div>
                                      </td>
                                      <td style={{ padding: "11px 16px", fontSize: 13, color: "#1e293b", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {f.nombreDocumento || f.name}
                                      </td>
                                      <td style={{ padding: "11px 16px" }}>
                                        {f.codigo
                                          ? <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{f.codigo}</code>
                                          : <span style={{ color: "#d1d5db" }}>—</span>
                                        }
                                      </td>
                                      <td style={{ padding: "11px 16px", fontSize: 13, color: "#374151" }}>
                                        {f.encargadoDocumento?.name ?? <span style={{ color: "#d1d5db" }}>—</span>}
                                      </td>
                                      <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b" }}>
                                        {f.folder?.name ?? <span style={{ color: "#d1d5db" }}>{t("root")}</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* ── Archivo Histórico tab ── */}
      {activeTab === "archivo" && isAdmin && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
          {/* Notice */}
          <div style={{ marginBottom: 16, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "9px 14px", fontSize: 12, color: "#92400e" }}>
            {t("obsoleteNotice")}
          </div>

          {/* Search */}
          <div style={{ marginBottom: 16 }}>
            <input
              value={archSearch}
              onChange={(e) => setArchSearch(e.target.value)}
              placeholder={t("archSearchPlaceholder")}
              style={{ width: "100%", maxWidth: 440, padding: "8px 14px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {archLoading ? (
            <p style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>{tc("loading")}</p>
          ) : (() => {
            const filtered = archFiles.filter((f) => {
              if (!archSearch) return true;
              const q = archSearch.toLowerCase();
              return (f.nombreDocumento ?? "").toLowerCase().includes(q) || (f.codigo ?? "").toLowerCase().includes(q) || (f.folder?.name ?? "").toLowerCase().includes(q) || (f.departamento ?? "").toLowerCase().includes(q);
            });
            if (filtered.length === 0) return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 280, color: "#94a3b8", gap: 12 }}>
                <Archive size={40} strokeWidth={1} />
                <p style={{ margin: 0, fontSize: 14 }}>{archFiles.length === 0 ? t("emptyObsolete") : t("noSearchResults")}</p>
              </div>
            );
            return (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #f1f5f9", background: "#f8fafc" }}>
                      {[tc("documento"), tc("carpeta"), tc("tipo"), tc("version"), t("archivedOn"), t("comparativa"), ""].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => (
                      <tr key={f.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                        <td style={{ padding: "11px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <FileIcon mimeType={f.mimeType} size={16} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{f.nombreDocumento || f.name}</div>
                              {f.codigo && <div style={{ fontSize: 11, color: "#0369a1", fontWeight: 600 }}>{f.codigo}</div>}
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmtSize(f.size)}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>{f.folder?.name ?? <span style={{ color: "#cbd5e1" }}>{t("noFolder")}</span>}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>{f.tipoDocumento ?? "—"}</td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ background: "#f1f5f9", color: "#475569", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4 }}>{f.versionStr ?? "—"}</span>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#94a3b8" }}>{new Date(f.updatedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td style={{ padding: "11px 14px" }}>
                          {f.comparisonStorageKey ? (
                            <div style={{ display: "flex", gap: 5 }}>
                              <button onClick={() => viewComparison(f.id)} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                <Eye size={12} /> {tc("ver")}
                              </button>
                              <button onClick={() => { setCompModal(f); setCompFile(null); setCompError(null); }} style={{ background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11 }} title="Reemplazar">
                                <Upload size={12} />
                              </button>
                              <button onClick={() => deleteComparison(f.id)} style={{ background: "#fff0f0", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 7px", cursor: "pointer" }} title="Quitar">
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => { setCompModal(f); setCompFile(null); setCompError(null); }} style={{ display: "flex", alignItems: "center", gap: 5, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>
                              <Paperclip size={12} /> {t("attach")}
                            </button>
                          )}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <button
                            onClick={() => archRestore(f.id, f.nombreDocumento || f.name)}
                            disabled={archRestoring === f.id}
                            style={{ display: "flex", alignItems: "center", gap: 5, background: brand, color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px", cursor: archRestoring === f.id ? "default" : "pointer", fontSize: 12, fontWeight: 600, opacity: archRestoring === f.id ? 0.6 : 1 }}
                          >
                            {archRestoring === f.id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RotateCcw size={13} />}
                            {t("restore")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Comparison modal */}
          {compModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => !compUploading && setCompModal(null)}>
              <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 15, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
                    <Paperclip size={16} color={brand} />
                    {compModal.comparisonStorageKey ? t("replaceComparison") : t("attachComparison")}
                  </h3>
                  {!compUploading && <button onClick={() => setCompModal(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>}
                </div>
                <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>{tc("documento")}: <strong>{compModal.nombreDocumento || compModal.name}</strong></p>
                <div onClick={() => !compUploading && compInputRef.current?.click()} style={{ border: `2px dashed ${compFile ? brand : "#cbd5e1"}`, borderRadius: 8, padding: 16, cursor: compUploading ? "default" : "pointer", textAlign: "center", background: compFile ? "#f0fdf4" : "#f8fafc", marginBottom: 14 }}>
                  {compFile ? (
                    <div style={{ fontSize: 13, color: "#15803d" }}><strong>{compFile.name}</strong><br /><span style={{ fontSize: 11, color: "#64748b" }}>{(compFile.size / 1024).toFixed(1)} KB</span></div>
                  ) : (
                    <div style={{ fontSize: 13, color: "#94a3b8" }}><FileText size={20} style={{ marginBottom: 6 }} /><br />{t("clickToSelect")}</div>
                  )}
                </div>
                <input ref={compInputRef} type="file" style={{ display: "none" }} onChange={(e) => setCompFile(e.target.files?.[0] ?? null)} />
                {compError && <p style={{ margin: "0 0 12px", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>{compError}</p>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  {!compUploading && <button onClick={() => setCompModal(null)} style={{ border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>{tc("cancel")}</button>}
                  <button onClick={handleCompUpload} disabled={compUploading || !compFile} style={{ background: brand, color: "#fff", border: "none", padding: "7px 18px", borderRadius: 8, cursor: (compUploading || !compFile) ? "default" : "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: (!compFile || compUploading) ? 0.6 : 1 }}>
                    {compUploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />}
                    {compUploading ? t("uploading") : t("attach")}
                  </button>
                </div>
              </div>
            </div>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, background: "#fff", boxSizing: "border-box" };
const pageBtn = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? "#f1f5f9" : "#fff", color: disabled ? "#94a3b8" : "#2563eb",
  border: "1px solid #e2e8f0", padding: "6px 14px", borderRadius: 7,
  cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
});
