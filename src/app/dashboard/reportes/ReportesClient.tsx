"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import * as XLSX from "xlsx";
import { Download, FileCheck, FileX, Upload, Trash2, Clock, AlertTriangle, CalendarClock, Files, X } from "lucide-react";

interface Summary {
  subidas: number;
  eliminaciones: number;
  revisiones: number;
  aprobadas: number;
  rechazadas: number;
  pendientes: number;
}

interface DetailRow {
  fecha: string;
  tipo: string;
  documento: string;
  codigo: string;
  solicitadoPor: string;
  estado: string;
  revisadoPor: string;
  fechaRevision: string;
  notas: string;
}

interface CountEntry { label: string; count: number; }

interface UserActivity {
  userId: string;
  name: string;
  subidas: number;
  eliminaciones: number;
  revisiones: number;
  aprobadas: number;
  rechazadas: number;
  total: number;
}

interface DocDetail {
  id: string;
  codigo: string;
  nombre: string;
  carpeta: string;
  departamento: string;
  tipoDocumento: string;
  status: string;
  encargado: string;
  fechaVencimiento: string | null;
  diasParaVencer: number | null;
  estaVencido: boolean;
}

interface ActivityDetail {
  id: string;
  fecha: string;
  usuarioId: string | null;
  usuario: string;
  accion: string;
  detalle: string;
}

interface DocMetrics {
  totalDocumentos: number;
  documentosVencidos: number;
  porRevisarSemana: number;
  porEstado: CountEntry[];
  porDepartamento: CountEntry[];
  porTipo: CountEntry[];
  actividadUsuarios: UserActivity[];
  documentos: DocDetail[];
}

interface Option { id: string; name: string; }
interface UserOption { id: string; name: string; email: string; }
interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string };
}

type Tab = "resumen" | "documentos" | "actividad" | "cambios";

interface DocFilterState {
  estado: string;
  departamento: string;
  tipoDocumento: string;
  vencidoOnly: boolean;
  porRevisarOnly: boolean;
  search: string;
}
const DEFAULT_DOC_FILTER: DocFilterState = { estado: "", departamento: "", tipoDocumento: "", vencidoOnly: false, porRevisarOnly: false, search: "" };

interface ActFilterState {
  usuarioId: string;
  accion: string;
  search: string;
}
const DEFAULT_ACT_FILTER: ActFilterState = { usuarioId: "", accion: "", search: "" };

// ─── horizontal bar list (no charting library — hand-rolled, clickable) ───────

function BarList({ data, color, translateLabel, emptyLabel, onSelect }: {
  data: CountEntry[];
  color: string;
  translateLabel?: (label: string) => string;
  emptyLabel: string;
  onSelect?: (label: string) => void;
}) {
  if (data.length === 0) {
    return <p style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0", textAlign: "center" }}>{emptyLabel}</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d) => (
        <div
          key={d.label}
          onClick={onSelect ? () => onSelect(d.label) : undefined}
          style={{ cursor: onSelect ? "pointer" : "default" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#374151", marginBottom: 3 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
              {translateLabel ? translateLabel(d.label) : d.label}
            </span>
            <span style={{ fontWeight: 700, color: "#1e293b" }}>{d.count}</span>
          </div>
          <div style={{ background: "#f1f5f9", borderRadius: 4, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${(d.count / max) * 100}%`, background: color, height: "100%", borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── per-user activity breakdown (each column is a specific action type) ──────

function UserActivityTable({ data, labels, emptyLabel, onSelect }: {
  data: UserActivity[];
  labels: { user: string; uploads: string; deletes: string; reviews: string; approved: string; rejected: string; total: string };
  emptyLabel: string;
  onSelect?: (userId: string) => void;
}) {
  if (data.length === 0) {
    return <p style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0", textAlign: "center" }}>{emptyLabel}</p>;
  }
  const cellStyle: React.CSSProperties = { padding: "6px 8px", textAlign: "center", fontSize: 12, color: "#374151" };
  const headStyle: React.CSSProperties = { padding: "0 8px 6px", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", whiteSpace: "nowrap" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...headStyle, textAlign: "left" }}>{labels.user}</th>
            <th style={headStyle}>{labels.uploads}</th>
            <th style={headStyle}>{labels.deletes}</th>
            <th style={headStyle}>{labels.reviews}</th>
            <th style={headStyle}>{labels.approved}</th>
            <th style={headStyle}>{labels.rejected}</th>
            <th style={{ ...headStyle, textAlign: "right" }}>{labels.total}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((u) => (
            <tr
              key={u.userId}
              onClick={onSelect ? () => onSelect(u.userId) : undefined}
              style={{ borderTop: "1px solid #f1f5f9", cursor: onSelect ? "pointer" : "default" }}
            >
              <td style={{ ...cellStyle, textAlign: "left", fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap" }}>{u.name}</td>
              <td style={cellStyle}>{u.subidas}</td>
              <td style={cellStyle}>{u.eliminaciones}</td>
              <td style={cellStyle}>{u.revisiones}</td>
              <td style={cellStyle}>{u.aprobadas}</td>
              <td style={cellStyle}>{u.rechazadas}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700, color: "#1e293b" }}>{u.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportesClient({ company }: Props) {
  const brand  = company.primaryColor;
  const t  = useTranslations("reportes");
  const tc = useTranslations("common");

  const TIPO_LABELS: Record<string, string> = {
    NEW_UPLOAD:           t("types.NEW_UPLOAD"),
    EDIT_METADATA:        t("types.EDIT_METADATA"),
    REPLACE_FILE:         t("types.REPLACE_FILE"),
    DELETE:               t("types.DELETE"),
    REVISION_DATE_CHANGE: t("types.REVISION_DATE_CHANGE"),
    OTHER:                t("types.OTHER"),
  };

  const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
    APPROVED: { label: t("status.APPROVED"), bg: "#dcfce7", color: "#166534" },
    REJECTED: { label: t("status.REJECTED"), bg: "#fee2e2", color: "#dc2626" },
    PENDING:  { label: t("status.PENDING"),  bg: "#fef3c7", color: "#92400e" },
  };

  const DOC_STATUS_LABELS: Record<string, string> = {
    DRAFT: t("docStatus.DRAFT"),
    IN_REVIEW: t("docStatus.IN_REVIEW"),
    REVIEWED: t("docStatus.REVIEWED"),
    PENDING_APPROVAL: t("docStatus.PENDING_APPROVAL"),
    OBSOLETE: t("docStatus.OBSOLETE"),
  };

  const ACTION_LABELS: Record<string, string> = {
    FILE_UPLOAD: t("actions.FILE_UPLOAD"),
    FILE_DELETE: t("actions.FILE_DELETE"),
    FILE_REVIEW_COMPLETE: t("actions.FILE_REVIEW_COMPLETE"),
    FILE_REVIEW_UPDATE: t("actions.FILE_REVIEW_UPDATE"),
    FILE_METADATA_UPDATE: t("actions.FILE_METADATA_UPDATE"),
    CHANGE_REQUEST_APPROVED: t("actions.CHANGE_REQUEST_APPROVED"),
    CHANGE_REQUEST_REJECTED: t("actions.CHANGE_REQUEST_REJECTED"),
  };

  const [tab, setTab] = useState<Tab>("resumen");

  const [summary, setSummary]       = useState<Summary | null>(null);
  const [docMetrics, setDocMetrics] = useState<DocMetrics | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityDetail[]>([]);
  const [details, setDetails]       = useState<DetailRow[]>([]);
  const [users,   setUsers]         = useState<UserOption[]>([]);
  const [folders, setFolders]       = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [documentTypes, setDocumentTypes] = useState<Option[]>([]);
  const [total,   setTotal]         = useState(0);
  const [loading, setLoading]       = useState(true);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [userId,   setUserId]   = useState("");
  const [folderId, setFolderId] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState("");
  const [encargadoId, setEncargadoId] = useState("");

  const [docFilter, setDocFilter] = useState<DocFilterState>(DEFAULT_DOC_FILTER);
  const [actFilter, setActFilter] = useState<ActFilterState>(DEFAULT_ACT_FILTER);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo)   p.set("dateTo",   dateTo);
    if (userId)   p.set("userId",   userId);
    if (folderId) p.set("folderId", folderId);
    if (departamento) p.set("departamento", departamento);
    if (tipoDocumento) p.set("tipoDocumento", tipoDocumento);
    if (encargadoId) p.set("encargadoId", encargadoId);
    const res = await fetch(`/api/reportes?${p}`);
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);
      setDocMetrics(data.docMetrics);
      setActivityLog(data.activityLog ?? []);
      setDetails(data.details);
      setUsers(data.users);
      setFolders(data.filters?.folders ?? []);
      setDepartments(data.filters?.departments ?? []);
      setDocumentTypes(data.filters?.documentTypes ?? []);
      setTotal(data.total);
    }
    setLoading(false);
  }, [dateFrom, dateTo, userId, folderId, departamento, tipoDocumento, encargadoId]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function clearFilters() {
    setDateFrom(""); setDateTo(""); setUserId("");
    setFolderId(""); setDepartamento(""); setTipoDocumento(""); setEncargadoId("");
  }

  // ── drill-down: jump from a KPI card / chart bar / user row into a pre-filtered detail tab ──

  function goToDocs(patch: Partial<DocFilterState>) {
    setDocFilter({ ...DEFAULT_DOC_FILTER, ...patch });
    setTab("documentos");
  }

  function goToActivity(patch: Partial<ActFilterState>) {
    setActFilter({ ...DEFAULT_ACT_FILTER, ...patch });
    setTab("actividad");
  }

  const filteredDocs = useMemo(() => {
    if (!docMetrics) return [];
    return docMetrics.documentos.filter((d) => {
      if (docFilter.estado && d.status !== docFilter.estado) return false;
      if (docFilter.departamento && d.departamento !== docFilter.departamento) return false;
      if (docFilter.tipoDocumento && d.tipoDocumento !== docFilter.tipoDocumento) return false;
      if (docFilter.vencidoOnly && !d.estaVencido) return false;
      if (docFilter.porRevisarOnly && !(d.diasParaVencer !== null && d.diasParaVencer >= 0 && d.diasParaVencer <= 7)) return false;
      if (docFilter.search) {
        const q = docFilter.search.toLowerCase();
        if (!d.nombre.toLowerCase().includes(q) && !d.codigo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [docMetrics, docFilter]);

  const filteredActivity = useMemo(() => {
    return activityLog.filter((l) => {
      if (actFilter.usuarioId && l.usuarioId !== actFilter.usuarioId) return false;
      if (actFilter.accion && l.accion !== actFilter.accion) return false;
      if (actFilter.search) {
        const q = actFilter.search.toLowerCase();
        if (!l.usuario.toLowerCase().includes(q) && !l.detalle.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [activityLog, actFilter]);

  function exportCSV() {
    const headers = [t("cols.fecha"), t("cols.tipo"), t("cols.documento"), t("cols.codigo"), t("cols.requestedBy"), t("cols.estado"), t("cols.reviewedBy"), t("cols.fecha"), t("cols.notas")];
    const rows = details.map((r) => [
      new Date(r.fecha).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      TIPO_LABELS[r.tipo] ?? r.tipo,
      r.documento,
      r.codigo,
      r.solicitadoPor,
      STATUS_LABELS[r.estado]?.label ?? r.estado,
      r.revisadoPor,
      r.fechaRevision !== "—" ? new Date(r.fechaRevision).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "—",
      r.notas,
    ]);
    const csv = [headers, ...rows].map((row) =>
      row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `reporte-cambios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function downloadWorkbook(rows: Record<string, string | number>[], sheetName: string, filenamePrefix: string) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportCambiosExcel() {
    const rows = details.map((r) => ({
      [t("cols.fecha")]:       new Date(r.fecha).toLocaleDateString('es-CR'),
      [t("cols.tipo")]:        TIPO_LABELS[r.tipo] ?? r.tipo,
      [t("cols.documento")]:   r.documento,
      [t("cols.codigo")]:      r.codigo,
      [t("cols.requestedBy")]: r.solicitadoPor,
      [t("cols.estado")]:      STATUS_LABELS[r.estado]?.label ?? r.estado,
      [t("cols.reviewedBy")]:  r.revisadoPor,
      [t("cols.notas")]:       r.notas,
    }));
    downloadWorkbook(rows, t("tabs.cambios"), "reportes-cambios");
  }

  function exportDocsExcel() {
    const rows = filteredDocs.map((d) => ({
      [t("docCols.codigo")]:       d.codigo,
      [t("docCols.nombre")]:       d.nombre,
      [t("docCols.carpeta")]:      d.carpeta,
      [t("docCols.departamento")]: d.departamento,
      [t("docCols.tipo")]:         d.tipoDocumento,
      [t("docCols.estado")]:       DOC_STATUS_LABELS[d.status] ?? d.status,
      [t("docCols.encargado")]:    d.encargado,
      [t("docCols.vencimiento")]:  d.fechaVencimiento ? fmtDate(d.fechaVencimiento) : t("docCols.sinFecha"),
      [t("docCols.vencido")]:      d.estaVencido ? t("docCols.si") : t("docCols.no"),
    }));
    downloadWorkbook(rows, t("tabs.documentos"), "reportes-documentos");
  }

  function exportActivityExcel() {
    const rows = filteredActivity.map((l) => ({
      [t("actCols.fecha")]:   fmtDate(l.fecha),
      [t("actCols.usuario")]: l.usuario,
      [t("actCols.accion")]:  ACTION_LABELS[l.accion] ?? l.accion,
      [t("actCols.detalle")]: l.detalle,
    }));
    downloadWorkbook(rows, t("tabs.actividad"), "reportes-actividad");
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const STAT_CARDS = summary ? [
    { label: t("stats.uploads"),    value: summary.subidas,       icon: <Upload size={20} />,    color: "#2563eb" },
    { label: t("stats.deletes"),    value: summary.eliminaciones, icon: <Trash2 size={20} />,    color: "#dc2626" },
    { label: t("stats.reviews"),    value: summary.revisiones,    icon: <FileCheck size={20} />, color: "#7c3aed" },
    { label: t("stats.approved"),   value: summary.aprobadas,     icon: <FileCheck size={20} />, color: "#16a34a" },
    { label: t("stats.rejected"),   value: summary.rechazadas,    icon: <FileX size={20} />,     color: "#dc2626" },
    { label: t("stats.pending"),    value: summary.pendientes,    icon: <Clock size={20} />,     color: "#d97706" },
  ] : [];

  const TABS: { key: Tab; label: string }[] = [
    { key: "resumen",    label: t("tabs.resumen") },
    { key: "documentos", label: t("tabs.documentos") },
    { key: "actividad",  label: t("tabs.actividad") },
    { key: "cambios",    label: t("tabs.cambios") },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f1f5f9", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      {/* Section header */}
      <div style={{ background: brand, color: "#fff", padding: "12px 28px", position: "sticky", top: 0, zIndex: 10 }}>
        <strong style={{ fontSize: 16 }}>{t("header")}</strong>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {/* Filters (apply to every tab) */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 130px" }}>
            <label style={labelStyle}>{t("filters.from")}</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={labelStyle}>{t("filters.to")}</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={labelStyle}>{t("filters.user")}</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} style={inputStyle}>
              <option value="">{t("filters.allUsers")}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <label style={labelStyle}>{t("filters.folder")}</label>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)} style={inputStyle}>
              <option value="">{t("filters.allFolders")}</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <label style={labelStyle}>{t("filters.department")}</label>
            <select value={departamento} onChange={(e) => setDepartamento(e.target.value)} style={inputStyle}>
              <option value="">{t("filters.allDepartments")}</option>
              {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <label style={labelStyle}>{t("filters.docType")}</label>
            <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} style={inputStyle}>
              <option value="">{t("filters.allDocTypes")}</option>
              {documentTypes.map((dt) => <option key={dt.id} value={dt.name}>{dt.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <label style={labelStyle}>{t("filters.encargado")}</label>
            <select value={encargadoId} onChange={(e) => setEncargadoId(e.target.value)} style={inputStyle}>
              <option value="">{t("filters.allEncargados")}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <button onClick={fetchReport} style={{ background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            {t("filters.apply")}
          </button>
          <button onClick={clearFilters} style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
            {t("filters.clear")}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 20 }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{ background: "none", border: "none", padding: "9px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: tab === key ? brand : "#64748b", borderBottom: `3px solid ${tab === key ? brand : "transparent"}`, marginBottom: -2 }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{tc("loading")}</p>
        ) : (
          <>
            {/* ── RESUMEN TAB ── */}
            {tab === "resumen" && docMetrics && summary && (
              <>
                <p style={sectionTitleStyle}>{t("healthSection")}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 8 }}>
                  <button onClick={() => goToDocs({})} style={cardBtnStyle}>
                    <div style={{ color: "#334155", marginBottom: 4 }}><Files size={20} /></div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#334155" }}>{docMetrics.totalDocumentos}</div>
                    <div style={cardLabelStyle}>{t("docStats.total")}</div>
                  </button>
                  <button onClick={() => goToDocs({ vencidoOnly: true })} style={cardBtnStyle}>
                    <div style={{ color: "#dc2626", marginBottom: 4 }}><AlertTriangle size={20} /></div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#dc2626" }}>{docMetrics.documentosVencidos}</div>
                    <div style={cardLabelStyle}>{t("docStats.overdue")}</div>
                  </button>
                  <button onClick={() => goToDocs({ porRevisarOnly: true })} style={cardBtnStyle}>
                    <div style={{ color: "#d97706", marginBottom: 4 }}><CalendarClock size={20} /></div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#d97706" }}>{docMetrics.porRevisarSemana}</div>
                    <div style={cardLabelStyle}>{t("docStats.dueThisWeek")}</div>
                  </button>
                </div>
                <p style={hintStyle}>{t("clickHint")}</p>

                <p style={sectionTitleStyle}>{t("activitySection")}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
                  {STAT_CARDS.map((s) => (
                    <div key={s.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px" }}>
                      <div style={{ color: s.color, marginBottom: 4 }}>{s.icon}</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={cardLabelStyle}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <p style={sectionTitleStyle}>{t("distributionSection")}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 24 }}>
                  <div style={panelStyle}>
                    <p style={panelTitleStyle}>{t("charts.byStatus")}</p>
                    <BarList
                      data={docMetrics.porEstado}
                      color={brand}
                      translateLabel={(l) => DOC_STATUS_LABELS[l] ?? l}
                      emptyLabel={t("charts.noData")}
                      onSelect={(label) => goToDocs({ estado: label })}
                    />
                  </div>
                  <div style={panelStyle}>
                    <p style={panelTitleStyle}>{t("charts.byDepartment")}</p>
                    <BarList
                      data={docMetrics.porDepartamento}
                      color="#7c3aed"
                      emptyLabel={t("charts.noData")}
                      onSelect={(label) => goToDocs({ departamento: label })}
                    />
                  </div>
                  <div style={panelStyle}>
                    <p style={panelTitleStyle}>{t("charts.byType")}</p>
                    <BarList
                      data={docMetrics.porTipo}
                      color="#0891b2"
                      emptyLabel={t("charts.noData")}
                      onSelect={(label) => goToDocs({ tipoDocumento: label })}
                    />
                  </div>
                  <div style={{ ...panelStyle, gridColumn: "1 / -1" }}>
                    <p style={panelTitleStyle}>{t("charts.byUser")}</p>
                    <UserActivityTable
                      data={docMetrics.actividadUsuarios}
                      labels={{
                        user: t("filters.user"),
                        uploads: t("stats.uploads"),
                        deletes: t("stats.deletes"),
                        reviews: t("stats.reviews"),
                        approved: t("stats.approved"),
                        rejected: t("stats.rejected"),
                        total: t("charts.total"),
                      }}
                      emptyLabel={t("charts.noData")}
                      onSelect={(uid) => goToActivity({ usuarioId: uid })}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── DOCUMENTOS TAB ── */}
            {tab === "documentos" && docMetrics && (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                  <div style={{ flex: "1 1 150px" }}>
                    <label style={labelStyle}>{t("docFilters.estado")}</label>
                    <select value={docFilter.estado} onChange={(e) => setDocFilter((f) => ({ ...f, estado: e.target.value }))} style={inputStyle}>
                      <option value="">{t("docFilters.allEstados")}</option>
                      {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 150px" }}>
                    <label style={labelStyle}>{t("filters.department")}</label>
                    <select value={docFilter.departamento} onChange={(e) => setDocFilter((f) => ({ ...f, departamento: e.target.value }))} style={inputStyle}>
                      <option value="">{t("filters.allDepartments")}</option>
                      {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 150px" }}>
                    <label style={labelStyle}>{t("filters.docType")}</label>
                    <select value={docFilter.tipoDocumento} onChange={(e) => setDocFilter((f) => ({ ...f, tipoDocumento: e.target.value }))} style={inputStyle}>
                      <option value="">{t("filters.allDocTypes")}</option>
                      {documentTypes.map((dt) => <option key={dt.id} value={dt.name}>{dt.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 180px" }}>
                    <label style={labelStyle}>{t("docFilters.search")}</label>
                    <input value={docFilter.search} onChange={(e) => setDocFilter((f) => ({ ...f, search: e.target.value }))} placeholder={t("docFilters.searchPlaceholder")} style={inputStyle} />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", paddingBottom: 7 }}>
                    <input type="checkbox" checked={docFilter.vencidoOnly} onChange={(e) => setDocFilter((f) => ({ ...f, vencidoOnly: e.target.checked }))} />
                    {t("docFilters.vencidoOnly")}
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", paddingBottom: 7 }}>
                    <input type="checkbox" checked={docFilter.porRevisarOnly} onChange={(e) => setDocFilter((f) => ({ ...f, porRevisarOnly: e.target.checked }))} />
                    {t("docFilters.porRevisarOnly")}
                  </label>
                  {JSON.stringify(docFilter) !== JSON.stringify(DEFAULT_DOC_FILTER) && (
                    <button onClick={() => setDocFilter(DEFAULT_DOC_FILTER)} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12 }}>
                      <X size={13} /> {t("docFilters.clearDrill")}
                    </button>
                  )}
                  <button
                    onClick={exportDocsExcel}
                    disabled={filteredDocs.length === 0}
                    style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 7, cursor: filteredDocs.length ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, opacity: filteredDocs.length ? 1 : 0.5 }}
                  >
                    <Download size={14} /> {t("exportExcel")}
                  </button>
                </div>
                <div style={{ padding: "8px 20px", fontSize: 12, color: "#94a3b8" }}>
                  {t("docFilters.showing", { count: filteredDocs.length, total: docMetrics.documentos.length })}
                </div>
                {filteredDocs.length === 0 ? (
                  <p style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{t("docCols.empty")}</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          {[t("docCols.codigo"), t("docCols.nombre"), t("docCols.carpeta"), t("docCols.departamento"), t("docCols.tipo"), t("docCols.estado"), t("docCols.encargado"), t("docCols.vencimiento")].map((h) => (
                            <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDocs.map((d) => (
                          <tr key={d.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                            <td style={{ padding: "11px 16px" }}>
                              {d.codigo !== "—" ? <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{d.codigo}</code> : <span style={{ color: "#d1d5db" }}>—</span>}
                            </td>
                            <td style={{ padding: "11px 16px", fontSize: 13, color: "#1e293b", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nombre}</td>
                            <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b" }}>{d.carpeta}</td>
                            <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b" }}>{d.departamento}</td>
                            <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b" }}>{d.tipoDocumento}</td>
                            <td style={{ padding: "11px 16px" }}>
                              <span style={{ background: "#f1f5f9", color: "#374151", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{DOC_STATUS_LABELS[d.status] ?? d.status}</span>
                            </td>
                            <td style={{ padding: "11px 16px", fontSize: 13, color: "#374151" }}>{d.encargado}</td>
                            <td style={{ padding: "11px 16px", fontSize: 12, whiteSpace: "nowrap" }}>
                              {d.fechaVencimiento ? (
                                <span style={{ color: d.estaVencido ? "#dc2626" : "#64748b", fontWeight: d.estaVencido ? 700 : 400 }}>
                                  {fmtDate(d.fechaVencimiento)}{d.estaVencido ? ` · ${t("docCols.vencido")}` : ""}
                                </span>
                              ) : (
                                <span style={{ color: "#d1d5db" }}>{t("docCols.sinFecha")}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── ACTIVIDAD TAB ── */}
            {tab === "actividad" && (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                  <div style={{ flex: "1 1 160px" }}>
                    <label style={labelStyle}>{t("filters.user")}</label>
                    <select value={actFilter.usuarioId} onChange={(e) => setActFilter((f) => ({ ...f, usuarioId: e.target.value }))} style={inputStyle}>
                      <option value="">{t("filters.allUsers")}</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 180px" }}>
                    <label style={labelStyle}>{t("actFilters.accion")}</label>
                    <select value={actFilter.accion} onChange={(e) => setActFilter((f) => ({ ...f, accion: e.target.value }))} style={inputStyle}>
                      <option value="">{t("actFilters.allActions")}</option>
                      {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 180px" }}>
                    <label style={labelStyle}>{t("actFilters.search")}</label>
                    <input value={actFilter.search} onChange={(e) => setActFilter((f) => ({ ...f, search: e.target.value }))} placeholder={t("actFilters.searchPlaceholder")} style={inputStyle} />
                  </div>
                  {JSON.stringify(actFilter) !== JSON.stringify(DEFAULT_ACT_FILTER) && (
                    <button onClick={() => setActFilter(DEFAULT_ACT_FILTER)} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12 }}>
                      <X size={13} /> {t("docFilters.clearDrill")}
                    </button>
                  )}
                  <button
                    onClick={exportActivityExcel}
                    disabled={filteredActivity.length === 0}
                    style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 7, cursor: filteredActivity.length ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, opacity: filteredActivity.length ? 1 : 0.5 }}
                  >
                    <Download size={14} /> {t("exportExcel")}
                  </button>
                </div>
                <div style={{ padding: "8px 20px", fontSize: 12, color: "#94a3b8" }}>
                  {t("actFilters.showing", { count: filteredActivity.length, total: activityLog.length })}
                </div>
                {filteredActivity.length === 0 ? (
                  <p style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{t("actCols.empty")}</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          {[t("actCols.fecha"), t("actCols.usuario"), t("actCols.accion"), t("actCols.detalle")].map((h) => (
                            <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredActivity.map((l) => (
                          <tr key={l.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                            <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(l.fecha)}</td>
                            <td style={{ padding: "11px 16px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>{l.usuario}</td>
                            <td style={{ padding: "11px 16px" }}>
                              <span style={{ background: "#f1f5f9", color: "#374151", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{ACTION_LABELS[l.accion] ?? l.accion}</span>
                            </td>
                            <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.detalle}>{l.detalle}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── CAMBIOS TAB ── */}
            {tab === "cambios" && (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{t("detailTitle")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{total} {t("records")}</span>
                    <button
                      onClick={exportCSV}
                      disabled={details.length === 0}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", padding: "7px 14px", borderRadius: 7, cursor: details.length ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, opacity: details.length ? 1 : 0.6 }}
                    >
                      <Download size={14} /> {t("exportCsv")}
                    </button>
                    <button
                      onClick={exportCambiosExcel}
                      disabled={details.length === 0}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: brand, color: "#fff", border: "none", padding: "7px 14px", borderRadius: 7, cursor: details.length ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, opacity: details.length ? 1 : 0.6 }}
                    >
                      <Download size={14} /> {t("exportExcel")}
                    </button>
                  </div>
                </div>
                {details.length === 0 ? (
                  <p style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{t("empty")}</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          {[t("cols.fecha"), t("cols.tipo"), t("cols.documento"), t("cols.codigo"), t("cols.requestedBy"), t("cols.estado"), t("cols.reviewedBy"), t("cols.notas")].map((h) => (
                            <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {details.map((r, i) => {
                          const st = STATUS_LABELS[r.estado] ?? { label: r.estado, bg: "#f3f4f6", color: "#374151" };
                          return (
                            <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                              <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(r.fecha)}</td>
                              <td style={{ padding: "11px 16px", fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>{TIPO_LABELS[r.tipo] ?? r.tipo}</td>
                              <td style={{ padding: "11px 16px", fontSize: 13, color: "#1e293b", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.documento}</td>
                              <td style={{ padding: "11px 16px" }}>
                                {r.codigo !== "—" ? <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{r.codigo}</code> : <span style={{ color: "#d1d5db" }}>—</span>}
                              </td>
                              <td style={{ padding: "11px 16px", fontSize: 13, color: "#374151" }}>{r.solicitadoPor}</td>
                              <td style={{ padding: "11px 16px" }}>
                                <span style={{ background: st.bg, color: st.color, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                              </td>
                              <td style={{ padding: "11px 16px", fontSize: 13, color: "#64748b" }}>{r.revisadoPor}</td>
                              <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.notas}>{r.notas !== "—" ? r.notas : <span style={{ color: "#d1d5db" }}>—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, background: "#fff", boxSizing: "border-box" };
const sectionTitleStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" };
const panelStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px" };
const panelTitleStyle: React.CSSProperties = { margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#1e293b" };
const cardBtnStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px", textAlign: "left", cursor: "pointer", font: "inherit" };
const cardLabelStyle: React.CSSProperties = { fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 };
const hintStyle: React.CSSProperties = { fontSize: 11, color: "#94a3b8", margin: "0 0 24px" };
