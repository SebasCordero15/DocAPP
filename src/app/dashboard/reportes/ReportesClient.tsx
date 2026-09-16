"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import * as XLSX from "xlsx";
import { Download, FileCheck, FileX, Upload, Trash2, Clock, AlertTriangle, CalendarClock, Files, X, ShieldCheck, ArrowUp, ArrowDown, Minus } from "lucide-react";

interface Summary {
  subidas: number;
  eliminaciones: number;
  revisiones: number;
  aprobadas: number;
  rechazadas: number;
  pendientes: number;
}

interface CambioRow {
  fecha: string;
  tipo: string;
  documento: string;
  codigo: string;
  version: string;
  motivo: string;
  solicitante: string;
  decididoPor: string;
  estado: string;
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

interface CompliancePct { label: string; total: number; pct: number; }

interface DocMetrics {
  totalDocumentos: number;
  documentosVencidos: number;
  porRevisarSemana: number;
  porEstado: CountEntry[];
  porDepartamento: CountEntry[];
  porTipo: CountEntry[];
  actividadUsuarios: UserActivity[];
  documentos: DocDetail[];
  cumplimientoGeneral: number;
  cumplimientoPorDepartamento: CompliancePct[];
}

interface PendingApproval {
  id: string; documento: string; codigo: string; tipo: string;
  esperandoDe: string; desde: string; diasEsperando: number;
}
interface ResolvedApproval {
  id: string; documento: string; codigo: string; tipo: string; departamento: string;
  resultado: string; decididoPor: string; fecha: string; diasQueTomo: number;
}
interface DurationEntry { label: string; count: number; promedioDias: number; }
interface TurnaroundMonth { mes: string; casos: number; totalDias: number; promedioDias: number | null; }
interface Aprobaciones {
  pendientes: PendingApproval[];
  historial: ResolvedApproval[];
  tiemposPorUsuario: DurationEntry[];
  tiemposPorDepartamento: DurationEntry[];
  tendenciaTiempos: TurnaroundMonth[];
}

interface MonthTrend {
  mes: string; subidas: number; eliminaciones: number; revisiones: number; aprobadas: number; rechazadas: number;
}

interface Option { id: string; name: string; }
interface UserOption { id: string; name: string; email: string; }
interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string };
}

type Tab = "resumen" | "documentos" | "aprobaciones" | "cambios" | "actividad";

const HORIZON_OPTIONS = [7, 15, 30, 60, 90] as const;
const TREND_COLORS = { subidas: "#2563eb", eliminaciones: "#f97316", revisiones: "#7c3aed", aprobadas: "#16a34a", rechazadas: "#dc2626" };
const DONUT_COLORS = ["#2563eb", "#7c3aed", "#16a34a", "#d97706", "#dc2626", "#0891b2"];

interface DocFilterState {
  estado: string;
  departamento: string;
  tipoDocumento: string;
  vencidoOnly: boolean;
  horizonDias: number | null;
  search: string;
}
const DEFAULT_DOC_FILTER: DocFilterState = { estado: "", departamento: "", tipoDocumento: "", vencidoOnly: false, horizonDias: null, search: "" };

interface ActFilterState {
  usuarioId: string;
  accion: string;
  search: string;
}
const DEFAULT_ACT_FILTER: ActFilterState = { usuarioId: "", accion: "", search: "" };

interface AprFilterState {
  resultado: string;
  search: string;
}
const DEFAULT_APR_FILTER: AprFilterState = { resultado: "", search: "" };

function fmtMonthShort(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-CR", { month: "short", year: "2-digit" });
}

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

// ─── approval turnaround, worst first (high days = bad → red/amber/green) ─────

function DurationList({ data, diasLabel, casosLabel, emptyLabel }: {
  data: DurationEntry[];
  diasLabel: string;
  casosLabel: string;
  emptyLabel: string;
}) {
  if (data.length === 0) {
    return <p style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0", textAlign: "center" }}>{emptyLabel}</p>;
  }
  const max = Math.max(...data.map((d) => d.promedioDias), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d) => {
        const color = d.promedioDias > 5 ? "#dc2626" : d.promedioDias > 2 ? "#d97706" : "#16a34a";
        return (
          <div key={d.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#374151", marginBottom: 3 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{d.label}</span>
              <span style={{ fontWeight: 700, color, whiteSpace: "nowrap" }}>{d.promedioDias} {diasLabel} · {d.count} {casosLabel}</span>
            </div>
            <div style={{ background: "#f1f5f9", borderRadius: 4, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${(d.promedioDias / max) * 100}%`, background: color, height: "100%", borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── compliance %, worst first (high % = good → green/amber/red) ─────────────

function PercentBarList({ data, emptyLabel }: { data: CompliancePct[]; emptyLabel: string }) {
  if (data.length === 0) {
    return <p style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0", textAlign: "center" }}>{emptyLabel}</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d) => {
        const color = d.pct >= 90 ? "#16a34a" : d.pct >= 70 ? "#d97706" : "#dc2626";
        return (
          <div key={d.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#374151", marginBottom: 3 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{d.label}</span>
              <span style={{ fontWeight: 700, color }}>{d.pct}% <span style={{ fontWeight: 400, color: "#94a3b8" }}>({d.total})</span></span>
            </div>
            <div style={{ background: "#f1f5f9", borderRadius: 4, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${d.pct}%`, background: color, height: "100%", borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── donut chart (small fixed category sets — e.g. document status) ──────────

function DonutChart({ data, colors, size = 150, totalLabel }: {
  data: CountEntry[]; colors: string[]; size?: number; totalLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const r = size / 2;
  const strokeW = size * 0.22;
  const innerR = r - strokeW / 2;
  const circumference = 2 * Math.PI * innerR;
  let offsetAcc = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${r} ${r})`}>
          {total === 0 ? (
            <circle cx={r} cy={r} r={innerR} fill="none" stroke="#f1f5f9" strokeWidth={strokeW} />
          ) : data.map((d, i) => {
            const frac = d.count / total;
            const dash = frac * circumference;
            const el = (
              <circle
                key={d.label} cx={r} cy={r} r={innerR} fill="none" stroke={colors[i % colors.length]}
                strokeWidth={strokeW} strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offsetAcc}
              />
            );
            offsetAcc += dash;
            return el;
          })}
        </g>
        <text x={r} y={r - 3} textAnchor="middle" fontSize={size * 0.18} fontWeight={800} fill="#1e293b">{total}</text>
        <text x={r} y={r + size * 0.13} textAnchor="middle" fontSize={size * 0.075} fill="#94a3b8">{totalLabel}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 120 }}>
        {data.map((d, i) => (
          <span key={d.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[i % colors.length], display: "inline-block", flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
            <strong style={{ marginLeft: "auto" }}>{d.count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── line chart (monthly trend, multi-series, static SVG — no library) ───────

interface LineSeries { label: string; color: string; values: (number | null)[]; }

function LineChart({ xLabels, series, height = 170 }: { xLabels: string[]; series: LineSeries[]; height?: number }) {
  const width = 640;
  const pad = { top: 14, right: 12, bottom: 22, left: 26 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const maxV = Math.max(...allValues, 1);
  const n = xLabels.length;
  const xStep = n > 1 ? innerW / (n - 1) : 0;
  const yOf = (v: number) => pad.top + innerH - (v / maxV) * innerH;
  const xOf = (i: number) => pad.left + i * xStep;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={pad.left} x2={width - pad.right} y1={pad.top + innerH * (1 - f)} y2={pad.top + innerH * (1 - f)} stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {series.map((s) => {
          const segments: string[] = [];
          let current: string[] = [];
          s.values.forEach((v, i) => {
            if (v === null) {
              if (current.length) segments.push(current.join(" "));
              current = [];
            } else {
              current.push(`${xOf(i)},${yOf(v)}`);
            }
          });
          if (current.length) segments.push(current.join(" "));
          return (
            <g key={s.label}>
              {segments.map((pts, i) => <polyline key={i} points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
              {s.values.map((v, i) => v === null ? null : <circle key={i} cx={xOf(i)} cy={yOf(v)} r={3} fill={s.color} />)}
            </g>
          );
        })}
        {xLabels.map((lbl, i) => (
          <text key={i} x={xOf(i)} y={height - 6} fontSize={10} fill="#94a3b8" textAnchor="middle" style={{ textTransform: "capitalize" }}>{lbl}</text>
        ))}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8, justifyContent: "center" }}>
        {series.map((s) => (
          <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block" }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── period-over-period delta chip ────────────────────────────────────────────

function DeltaChip({ label, current, previous, suffix, invertColor = false }: { label: string; current: number; previous: number; suffix: string; invertColor?: boolean }) {
  const delta = previous === 0 ? (current === 0 ? 0 : 100) : Math.round(((current - previous) / previous) * 100);
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  // Most metrics: up = good (more uploads/approvals). Turnaround days: up = bad (slower).
  const isGood = invertColor ? delta < 0 : delta > 0;
  const color = delta === 0 ? "#94a3b8" : isGood ? "#16a34a" : "#dc2626";
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: "#1e293b" }}>{current}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 700, color }}>
          <Icon size={12} />{Math.abs(delta)}%
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#cbd5e1" }}>{suffix}</div>
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

// ─── monthly trend table — exact numbers behind the line chart ───────────────

function TrendTable({ data, labels }: {
  data: MonthTrend[];
  labels: { mes: string; uploads: string; deletes: string; reviews: string; approved: string; rejected: string };
}) {
  const cellStyle: React.CSSProperties = { padding: "6px 8px", textAlign: "center", fontSize: 12, color: "#374151" };
  const headStyle: React.CSSProperties = { padding: "0 8px 6px", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", whiteSpace: "nowrap" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...headStyle, textAlign: "left" }}>{labels.mes}</th>
            <th style={headStyle}>{labels.uploads}</th>
            <th style={headStyle}>{labels.deletes}</th>
            <th style={headStyle}>{labels.reviews}</th>
            <th style={headStyle}>{labels.approved}</th>
            <th style={headStyle}>{labels.rejected}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m, i) => (
            <tr key={m.mes} style={{ borderTop: "1px solid #f1f5f9", background: i === data.length - 1 ? "#f8fafc" : "transparent" }}>
              <td style={{ ...cellStyle, textAlign: "left", fontWeight: i === data.length - 1 ? 700 : 600, color: "#1e293b", textTransform: "capitalize" }}>{fmtMonthShort(m.mes)}</td>
              <td style={cellStyle}>{m.subidas}</td>
              <td style={cellStyle}>{m.eliminaciones}</td>
              <td style={cellStyle}>{m.revisiones}</td>
              <td style={cellStyle}>{m.aprobadas}</td>
              <td style={cellStyle}>{m.rechazadas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── quarterly + yearly rollup — same monthly data, summed into wider periods ─

function PeriodRollupTable({ quarters, total, labels }: {
  quarters: (MonthTrend & { label: string })[];
  total: MonthTrend & { label: string };
  labels: { period: string; uploads: string; deletes: string; reviews: string; approved: string; rejected: string };
}) {
  const cellStyle: React.CSSProperties = { padding: "6px 8px", textAlign: "center", fontSize: 12, color: "#374151" };
  const headStyle: React.CSSProperties = { padding: "0 8px 6px", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", whiteSpace: "nowrap" };
  const rows = [...quarters, total];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...headStyle, textAlign: "left" }}>{labels.period}</th>
            <th style={headStyle}>{labels.uploads}</th>
            <th style={headStyle}>{labels.deletes}</th>
            <th style={headStyle}>{labels.reviews}</th>
            <th style={headStyle}>{labels.approved}</th>
            <th style={headStyle}>{labels.rejected}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} style={{ borderTop: i === rows.length - 1 ? "2px solid #e2e8f0" : "1px solid #f1f5f9", background: i === rows.length - 1 ? "#f8fafc" : "transparent" }}>
              <td style={{ ...cellStyle, textAlign: "left", fontWeight: i === rows.length - 1 ? 700 : 600, color: "#1e293b" }}>{r.label}</td>
              <td style={cellStyle}>{r.subidas}</td>
              <td style={cellStyle}>{r.eliminaciones}</td>
              <td style={cellStyle}>{r.revisiones}</td>
              <td style={cellStyle}>{r.aprobadas}</td>
              <td style={cellStyle}>{r.rechazadas}</td>
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
    REVIEW_STEP:          t("types.REVIEW_STEP"),
    OUT_ACTUALIZACION:    t("types.OUT_ACTUALIZACION"),
    OUT_REVISION:         t("types.OUT_REVISION"),
    OUT_CORRECCION:       t("types.OUT_CORRECCION"),
    FILE_DELETE:          t("types.FILE_DELETE"),
    FILE_OBSOLETE:        t("types.FILE_OBSOLETE"),
  };

  const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
    APPROVED: { label: t("status.APPROVED"), bg: "#dcfce7", color: "#166534" },
    REJECTED: { label: t("status.REJECTED"), bg: "#fee2e2", color: "#dc2626" },
    PENDING:  { label: t("status.PENDING"),  bg: "#fef3c7", color: "#92400e" },
  };

  const RESULTADO_LABELS: Record<string, { label: string; bg: string; color: string }> = {
    APPROVED:  { label: t("resultado.APPROVED"),  bg: "#dcfce7", color: "#166534" },
    REJECTED:  { label: t("resultado.REJECTED"),  bg: "#fee2e2", color: "#dc2626" },
    COMPLETED: { label: t("resultado.COMPLETED"), bg: "#dcfce7", color: "#166534" },
  };

  const DOC_STATUS_LABELS: Record<string, string> = {
    DRAFT: t("docStatus.DRAFT"),
    IN_REVIEW: t("docStatus.IN_REVIEW"),
    REVIEWED: t("docStatus.REVIEWED"),
    PENDING_APPROVAL: t("docStatus.PENDING_APPROVAL"),
    OBSOLETE: t("docStatus.OBSOLETE"),
  };

  const HORIZON_LABELS: Record<number, string> = {
    7:  t("docFilters.horizonte7"),
    15: t("docFilters.horizonte15"),
    30: t("docFilters.horizonte30"),
    60: t("docFilters.horizonte60"),
    90: t("docFilters.horizonte90"),
  };

  const ACTION_LABELS: Record<string, string> = {
    FILE_UPLOAD: t("actions.FILE_UPLOAD"),
    FILE_DELETE: t("actions.FILE_DELETE"),
    FILE_OBSOLETE: t("actions.FILE_OBSOLETE"),
    FILE_REVIEW_COMPLETE: t("actions.FILE_REVIEW_COMPLETE"),
    FILE_REVIEW_UPDATE: t("actions.FILE_REVIEW_UPDATE"),
    FILE_METADATA_UPDATE: t("actions.FILE_METADATA_UPDATE"),
    CHANGE_REQUEST_APPROVED: t("actions.CHANGE_REQUEST_APPROVED"),
    CHANGE_REQUEST_REJECTED: t("actions.CHANGE_REQUEST_REJECTED"),
  };

  const [tab, setTab] = useState<Tab>("resumen");
  const [trendView, setTrendView] = useState<"mensual" | "trimestral" | "anual">("mensual");
  const [tiemposView, setTiemposView] = useState<"mensual" | "trimestral" | "anual">("mensual");

  const [summary, setSummary]       = useState<Summary | null>(null);
  const [docMetrics, setDocMetrics] = useState<DocMetrics | null>(null);
  const [aprobaciones, setAprobaciones] = useState<Aprobaciones | null>(null);
  const [tendencia, setTendencia]   = useState<MonthTrend[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityDetail[]>([]);
  const [cambios, setCambios]       = useState<CambioRow[]>([]);
  const [users,   setUsers]         = useState<UserOption[]>([]);
  const [folders, setFolders]       = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [documentTypes, setDocumentTypes] = useState<Option[]>([]);
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
  const [aprFilter, setAprFilter] = useState<AprFilterState>(DEFAULT_APR_FILTER);

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
      setAprobaciones(data.aprobaciones ?? null);
      setTendencia(data.tendenciaMensual ?? []);
      setActivityLog(data.activityLog ?? []);
      setCambios(data.cambios ?? []);
      setUsers(data.users);
      setFolders(data.filters?.folders ?? []);
      setDepartments(data.filters?.departments ?? []);
      setDocumentTypes(data.filters?.documentTypes ?? []);
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
      if (docFilter.horizonDias !== null && !(d.diasParaVencer !== null && d.diasParaVencer >= 0 && d.diasParaVencer <= docFilter.horizonDias)) return false;
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

  const filteredHistorialAprobaciones = useMemo(() => {
    if (!aprobaciones) return [];
    return aprobaciones.historial.filter((r) => {
      if (aprFilter.resultado && r.resultado !== aprFilter.resultado) return false;
      if (aprFilter.search) {
        const q = aprFilter.search.toLowerCase();
        if (!r.documento.toLowerCase().includes(q) && !r.codigo.toLowerCase().includes(q) && !r.decididoPor.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [aprobaciones, aprFilter]);

  const avgOf = (casos: number, totalDias: number) => casos ? Math.round((totalDias / casos) * 10) / 10 : null;

  const tiemposMonthly = aprobaciones?.tendenciaTiempos ?? [];
  const tiemposQuarterly = useMemo(() => {
    const groups: { label: string; casos: number; totalDias: number; promedioDias: number | null }[] = [];
    for (let i = 0; i < tiemposMonthly.length; i += 3) {
      const chunk = tiemposMonthly.slice(i, i + 3);
      if (chunk.length === 0) continue;
      const casos = chunk.reduce((s, m) => s + m.casos, 0);
      const totalDias = chunk.reduce((s, m) => s + m.totalDias, 0);
      groups.push({ label: `${fmtMonthShort(chunk[0].mes)} – ${fmtMonthShort(chunk[chunk.length - 1].mes)}`, casos, totalDias, promedioDias: avgOf(casos, totalDias) });
    }
    return groups;
  }, [tiemposMonthly]);
  const tiemposAnnualTotal = useMemo(() => {
    const casos = tiemposMonthly.reduce((s, m) => s + m.casos, 0);
    const totalDias = tiemposMonthly.reduce((s, m) => s + m.totalDias, 0);
    return { casos, totalDias, promedioDias: avgOf(casos, totalDias) };
  }, [tiemposMonthly]);
  const comparativoTiemposMensual = tiemposMonthly.length >= 2
    ? { cur: tiemposMonthly[tiemposMonthly.length - 1], prev: tiemposMonthly[tiemposMonthly.length - 2] } : null;
  const comparativoTiemposTrimestral = tiemposQuarterly.length >= 2
    ? { cur: tiemposQuarterly[tiemposQuarterly.length - 1], prev: tiemposQuarterly[tiemposQuarterly.length - 2] } : null;

  function downloadWorkbook(rows: Record<string, string | number>[], sheetName: string, filenamePrefix: string) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportCSV() {
    const headers = [t("cols.fecha"), t("cols.tipo"), t("cols.documento"), t("cols.codigo"), t("cols.version"), t("cols.motivo"), t("cols.requestedBy"), t("cols.reviewedBy"), t("cols.estado")];
    const rows = cambios.map((r) => [
      fmtDate(r.fecha), TIPO_LABELS[r.tipo] ?? r.tipo, r.documento, r.codigo, r.version, r.motivo,
      r.solicitante, r.decididoPor, STATUS_LABELS[r.estado]?.label ?? r.estado,
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

  function exportCambiosExcel() {
    const rows = cambios.map((r) => ({
      [t("cols.fecha")]:       fmtDate(r.fecha),
      [t("cols.tipo")]:        TIPO_LABELS[r.tipo] ?? r.tipo,
      [t("cols.documento")]:   r.documento,
      [t("cols.codigo")]:      r.codigo,
      [t("cols.version")]:     r.version,
      [t("cols.motivo")]:      r.motivo,
      [t("cols.requestedBy")]: r.solicitante,
      [t("cols.reviewedBy")]:  r.decididoPor,
      [t("cols.estado")]:      STATUS_LABELS[r.estado]?.label ?? r.estado,
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

  function exportAprobacionesExcel() {
    const rows = filteredHistorialAprobaciones.map((r) => ({
      [t("aprCols.fecha")]:        fmtDate(r.fecha),
      [t("aprCols.documento")]:    r.documento,
      [t("aprCols.codigo")]:       r.codigo,
      [t("aprCols.tipo")]:         TIPO_LABELS[r.tipo] ?? r.tipo,
      [t("aprCols.resultado")]:    RESULTADO_LABELS[r.resultado]?.label ?? r.resultado,
      [t("aprCols.decididoPor")]:  r.decididoPor,
      [t("aprCols.diasQueTomo")]:  r.diasQueTomo,
    }));
    downloadWorkbook(rows, t("tabs.aprobaciones"), "reportes-aprobaciones");
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const esperandoLabel = (raw: string) => raw === "Admin" ? t("aprCols.adminLabel") : raw;

  const STAT_CARDS = summary ? [
    { label: t("stats.uploads"),    value: summary.subidas,       icon: <Upload size={20} />,    color: "#2563eb" },
    { label: t("stats.deletes"),    value: summary.eliminaciones, icon: <Trash2 size={20} />,    color: "#dc2626" },
    { label: t("stats.reviews"),    value: summary.revisiones,    icon: <FileCheck size={20} />, color: "#7c3aed" },
    { label: t("stats.approved"),   value: summary.aprobadas,     icon: <FileCheck size={20} />, color: "#16a34a" },
    { label: t("stats.rejected"),   value: summary.rechazadas,    icon: <FileX size={20} />,     color: "#dc2626" },
    { label: t("stats.pending"),    value: summary.pendientes,    icon: <Clock size={20} />,     color: "#d97706" },
  ] : [];

  const TABS: { key: Tab; label: string }[] = [
    { key: "resumen",      label: t("tabs.resumen") },
    { key: "documentos",   label: t("tabs.documentos") },
    { key: "aprobaciones", label: t("tabs.aprobaciones") },
    { key: "cambios",      label: t("tabs.cambios") },
    { key: "actividad",    label: t("tabs.actividad") },
  ];

  const complianceColor = (pct: number) => pct >= 90 ? "#16a34a" : pct >= 70 ? "#d97706" : "#dc2626";

  const donutPorEstado = docMetrics ? docMetrics.porEstado.map((e) => ({ label: DOC_STATUS_LABELS[e.label] ?? e.label, count: e.count })) : [];

  const monthLabels = tendencia.map((m) => fmtMonthShort(m.mes));
  const trendSeries: LineSeries[] = [
    { label: t("stats.uploads"),  color: TREND_COLORS.subidas,       values: tendencia.map((m) => m.subidas) },
    { label: t("stats.reviews"),  color: TREND_COLORS.revisiones,    values: tendencia.map((m) => m.revisiones) },
    { label: t("stats.approved"), color: TREND_COLORS.aprobadas,     values: tendencia.map((m) => m.aprobadas) },
    { label: t("stats.rejected"), color: TREND_COLORS.rechazadas,    values: tendencia.map((m) => m.rechazadas) },
  ];
  const comparativoMensual = tendencia.length >= 2 ? { cur: tendencia[tendencia.length - 1], prev: tendencia[tendencia.length - 2] } : null;

  const quarterlyRollup = useMemo(() => {
    const sum = (rows: MonthTrend[]): MonthTrend => rows.reduce((acc, m) => ({
      mes: m.mes,
      subidas: acc.subidas + m.subidas,
      eliminaciones: acc.eliminaciones + m.eliminaciones,
      revisiones: acc.revisiones + m.revisiones,
      aprobadas: acc.aprobadas + m.aprobadas,
      rechazadas: acc.rechazadas + m.rechazadas,
    }), { mes: "", subidas: 0, eliminaciones: 0, revisiones: 0, aprobadas: 0, rechazadas: 0 });
    const groups: (MonthTrend & { label: string })[] = [];
    for (let i = 0; i < tendencia.length; i += 3) {
      const chunk = tendencia.slice(i, i + 3);
      if (chunk.length === 0) continue;
      groups.push({ ...sum(chunk), label: `${fmtMonthShort(chunk[0].mes)} – ${fmtMonthShort(chunk[chunk.length - 1].mes)}` });
    }
    const total = { ...sum(tendencia), label: t("periodRollup.yearly") };
    return { groups, total };
  }, [tendencia, t]);

  const comparativoTrimestral = quarterlyRollup.groups.length >= 2
    ? { cur: quarterlyRollup.groups[quarterlyRollup.groups.length - 1], prev: quarterlyRollup.groups[quarterlyRollup.groups.length - 2] }
    : null;

  const quarterlySeries: LineSeries[] = [
    { label: t("stats.uploads"),  color: TREND_COLORS.subidas,    values: quarterlyRollup.groups.map((g) => g.subidas) },
    { label: t("stats.reviews"),  color: TREND_COLORS.revisiones, values: quarterlyRollup.groups.map((g) => g.revisiones) },
    { label: t("stats.approved"), color: TREND_COLORS.aprobadas,  values: quarterlyRollup.groups.map((g) => g.aprobadas) },
    { label: t("stats.rejected"), color: TREND_COLORS.rechazadas, values: quarterlyRollup.groups.map((g) => g.rechazadas) },
  ];
  const quarterLabels = quarterlyRollup.groups.map((g) => g.label);

  function renderComparativo(cur: MonthTrend, prev: MonthTrend, suffix: string) {
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <DeltaChip label={t("stats.uploads")}  current={cur.subidas}    previous={prev.subidas}    suffix={suffix} />
        <DeltaChip label={t("stats.reviews")}  current={cur.revisiones} previous={prev.revisiones} suffix={suffix} />
        <DeltaChip label={t("stats.approved")} current={cur.aprobadas}  previous={prev.aprobadas}  suffix={suffix} />
        <DeltaChip label={t("stats.rejected")} current={cur.rechazadas} previous={prev.rechazadas} suffix={suffix} />
      </div>
    );
  }

  const ANNUAL_CARDS = [
    { label: t("stats.uploads"),  value: quarterlyRollup.total.subidas,     icon: <Upload size={20} />,    color: TREND_COLORS.subidas },
    { label: t("stats.reviews"),  value: quarterlyRollup.total.revisiones,  icon: <FileCheck size={20} />, color: TREND_COLORS.revisiones },
    { label: t("stats.approved"), value: quarterlyRollup.total.aprobadas,   icon: <FileCheck size={20} />, color: TREND_COLORS.aprobadas },
    { label: t("stats.rejected"), value: quarterlyRollup.total.rechazadas,  icon: <FileX size={20} />,     color: TREND_COLORS.rechazadas },
    { label: t("stats.deletes"),  value: quarterlyRollup.total.eliminaciones, icon: <Trash2 size={20} />,  color: TREND_COLORS.eliminaciones },
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
        <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 20, flexWrap: "wrap" }}>
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
                  <button onClick={() => goToDocs({ horizonDias: 7 })} style={cardBtnStyle}>
                    <div style={{ color: "#d97706", marginBottom: 4 }}><CalendarClock size={20} /></div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#d97706" }}>{docMetrics.porRevisarSemana}</div>
                    <div style={cardLabelStyle}>{t("docStats.dueThisWeek")}</div>
                  </button>
                  <button onClick={() => setTab("aprobaciones")} style={cardBtnStyle}>
                    <div style={{ color: "#7c3aed", marginBottom: 4 }}><Clock size={20} /></div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#7c3aed" }}>{aprobaciones?.pendientes.length ?? 0}</div>
                    <div style={cardLabelStyle}>{t("docStats.pendingApprovals")}</div>
                  </button>
                  <div style={{ ...cardBtnStyle, cursor: "default" }}>
                    <div style={{ color: complianceColor(docMetrics.cumplimientoGeneral), marginBottom: 4 }}><ShieldCheck size={20} /></div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: complianceColor(docMetrics.cumplimientoGeneral) }}>{docMetrics.cumplimientoGeneral}%</div>
                    <div style={cardLabelStyle}>{t("docStats.compliance")}</div>
                  </div>
                </div>
                <p style={hintStyle}>{t("clickHint")} · {t("complianceHint")}</p>

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

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  <p style={{ ...sectionTitleStyle, margin: 0 }}>{t("trendSection")}</p>
                  <div style={{ display: "flex", gap: 3, background: "#e2e8f0", borderRadius: 8, padding: 3 }}>
                    {(["mensual", "trimestral", "anual"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setTrendView(v)}
                        style={{
                          padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                          background: trendView === v ? "#fff" : "transparent",
                          color: trendView === v ? brand : "#64748b",
                          boxShadow: trendView === v ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
                        }}
                      >
                        {t(`trendView.${v}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ ...panelStyle, marginBottom: 24 }}>
                  {trendView === "mensual" && (
                    <>
                      <p style={hintStyle}>{t("trendHint")}</p>
                      <LineChart xLabels={monthLabels} series={trendSeries} />
                      {comparativoMensual ? (
                        <>
                          <p style={{ ...panelTitleStyle, marginTop: 16 }}>{t("comparativo.title")}</p>
                          {renderComparativo(comparativoMensual.cur, comparativoMensual.prev, t("comparativo.vsAnterior"))}
                        </>
                      ) : <p style={hintStyle}>{t("comparativo.sinDatos")}</p>}
                      <details style={{ marginTop: 16 }}>
                        <summary style={{ cursor: "pointer", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{t("trendCols.mes")} → {t("charts.total")}</summary>
                        <div style={{ marginTop: 10 }}>
                          <TrendTable
                            data={tendencia}
                            labels={{ mes: t("trendCols.mes"), uploads: t("stats.uploads"), deletes: t("stats.deletes"), reviews: t("stats.reviews"), approved: t("stats.approved"), rejected: t("stats.rejected") }}
                          />
                        </div>
                      </details>
                    </>
                  )}
                  {trendView === "trimestral" && (
                    <>
                      <p style={hintStyle}>{t("periodRollup.quarterly")}</p>
                      <LineChart xLabels={quarterLabels} series={quarterlySeries} />
                      {comparativoTrimestral ? (
                        <>
                          <p style={{ ...panelTitleStyle, marginTop: 16 }}>{t("comparativo.title")}</p>
                          {renderComparativo(comparativoTrimestral.cur, comparativoTrimestral.prev, t("comparativo.vsAnteriorTrimestre"))}
                        </>
                      ) : <p style={hintStyle}>{t("comparativo.sinDatosTrimestre")}</p>}
                      <p style={{ ...panelTitleStyle, marginTop: 16 }}>{t("periodRollup.quarterly")}</p>
                      <PeriodRollupTable
                        quarters={quarterlyRollup.groups}
                        total={quarterlyRollup.total}
                        labels={{ period: t("periodRollup.period"), uploads: t("stats.uploads"), deletes: t("stats.deletes"), reviews: t("stats.reviews"), approved: t("stats.approved"), rejected: t("stats.rejected") }}
                      />
                    </>
                  )}
                  {trendView === "anual" && (
                    <>
                      <p style={hintStyle}>{t("comparativo.anualHint")}</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 }}>
                        {ANNUAL_CARDS.map((c) => (
                          <div key={c.label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
                            <div style={{ color: c.color, marginBottom: 4 }}>{c.icon}</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
                            <div style={cardLabelStyle}>{c.label}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <p style={sectionTitleStyle}>{t("distributionSection")}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 24 }}>
                  <div style={panelStyle}>
                    <p style={panelTitleStyle}>{t("charts.byStatus")}</p>
                    <DonutChart data={donutPorEstado} colors={DONUT_COLORS} totalLabel={t("docStats.total")} />
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
                  <div style={panelStyle}>
                    <p style={panelTitleStyle}>{t("complianceSection")}</p>
                    <PercentBarList data={docMetrics.cumplimientoPorDepartamento} emptyLabel={t("charts.noData")} />
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
                  <div style={{ flex: "1 1 140px" }}>
                    <label style={labelStyle}>{t("docFilters.horizonte")}</label>
                    <select
                      value={docFilter.horizonDias === null ? "" : String(docFilter.horizonDias)}
                      onChange={(e) => setDocFilter((f) => ({ ...f, horizonDias: e.target.value === "" ? null : Number(e.target.value) }))}
                      style={inputStyle}
                    >
                      <option value="">{t("docFilters.horizonteOff")}</option>
                      {HORIZON_OPTIONS.map((n) => <option key={n} value={n}>{HORIZON_LABELS[n]}</option>)}
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

            {/* ── APROBACIONES TAB ── */}
            {tab === "aprobaciones" && aprobaciones && (
              <>
                <p style={sectionTitleStyle}>{t("aprSections.pendientes")}</p>
                <div style={{ ...panelStyle, marginBottom: 24 }}>
                  <p style={hintStyle}>{t("aprSections.pendientesHint")}</p>
                  {aprobaciones.pendientes.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0", textAlign: "center" }}>{t("aprCols.emptyPendientes")}</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                            {[t("aprCols.documento"), t("aprCols.codigo"), t("aprCols.tipo"), t("aprCols.esperandoDe"), t("aprCols.desde"), t("aprCols.dias")].map((h) => (
                              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {aprobaciones.pendientes.map((p) => {
                            const color = p.diasEsperando > 7 ? "#dc2626" : p.diasEsperando > 2 ? "#d97706" : "#16a34a";
                            return (
                              <tr key={p.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                                <td style={{ padding: "10px 12px", fontSize: 13, color: "#1e293b" }}>{p.documento}</td>
                                <td style={{ padding: "10px 12px" }}>{p.codigo !== "—" ? <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{p.codigo}</code> : <span style={{ color: "#d1d5db" }}>—</span>}</td>
                                <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>{TIPO_LABELS[p.tipo] ?? p.tipo}</td>
                                <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151" }}>{esperandoLabel(p.esperandoDe)}</td>
                                <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(p.desde)}</td>
                                <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color }}>{p.diasEsperando}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <p style={sectionTitleStyle}>{t("aprSections.tiempos")}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 24 }}>
                  <div style={panelStyle}>
                    <p style={panelTitleStyle}>{t("aprSections.tiemposPorUsuario")}</p>
                    <DurationList data={aprobaciones.tiemposPorUsuario} diasLabel={t("aprCols.diasPromedio")} casosLabel={t("aprCols.casos")} emptyLabel={t("aprCols.emptyTiempos")} />
                  </div>
                  <div style={panelStyle}>
                    <p style={panelTitleStyle}>{t("aprSections.tiemposPorDepartamento")}</p>
                    <DurationList data={aprobaciones.tiemposPorDepartamento} diasLabel={t("aprCols.diasPromedio")} casosLabel={t("aprCols.casos")} emptyLabel={t("aprCols.emptyTiempos")} />
                  </div>
                  <div style={{ ...panelStyle, gridColumn: "1 / -1" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
                      <p style={{ ...panelTitleStyle, margin: 0 }}>{t("aprCols.tendenciaTiempos")}</p>
                      <div style={{ display: "flex", gap: 3, background: "#f1f5f9", borderRadius: 8, padding: 3 }}>
                        {(["mensual", "trimestral", "anual"] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => setTiemposView(v)}
                            style={{
                              padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                              background: tiemposView === v ? "#fff" : "transparent",
                              color: tiemposView === v ? brand : "#64748b",
                              boxShadow: tiemposView === v ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                            }}
                          >
                            {t(`trendView.${v}`)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {tiemposView === "mensual" && (
                      <>
                        <p style={hintStyle}>{t("aprCols.tendenciaTiemposHint")}</p>
                        <LineChart
                          xLabels={tiemposMonthly.map((m) => fmtMonthShort(m.mes))}
                          series={[{ label: t("aprCols.diasPromedio"), color: "#7c3aed", values: tiemposMonthly.map((m) => m.promedioDias) }]}
                          height={140}
                        />
                        <p style={{ ...panelTitleStyle, marginTop: 16, fontSize: 12 }}>{t("aprCols.tendenciaCasosTitle")}</p>
                        <BarList data={tiemposMonthly.map((m) => ({ label: fmtMonthShort(m.mes), count: m.casos }))} color="#94a3b8" emptyLabel={t("charts.noData")} />
                        {comparativoTiemposMensual && comparativoTiemposMensual.prev.casos > 0 && comparativoTiemposMensual.cur.casos > 0 ? (
                          <div style={{ marginTop: 16 }}>
                            <p style={{ ...panelTitleStyle, fontSize: 12 }}>{t("comparativo.title")}</p>
                            <DeltaChip
                              label={t("aprCols.diasPromedio")}
                              current={comparativoTiemposMensual.cur.promedioDias ?? 0}
                              previous={comparativoTiemposMensual.prev.promedioDias ?? 0}
                              suffix={t("comparativo.vsAnterior")}
                              invertColor
                            />
                          </div>
                        ) : null}
                      </>
                    )}

                    {tiemposView === "trimestral" && (
                      <>
                        <p style={hintStyle}>{t("aprCols.tendenciaTiemposHintTrimestral")}</p>
                        <LineChart
                          xLabels={tiemposQuarterly.map((q) => q.label)}
                          series={[{ label: t("aprCols.diasPromedio"), color: "#7c3aed", values: tiemposQuarterly.map((q) => q.promedioDias) }]}
                          height={140}
                        />
                        <p style={{ ...panelTitleStyle, marginTop: 16, fontSize: 12 }}>{t("aprCols.tendenciaCasosTitle")}</p>
                        <BarList data={tiemposQuarterly.map((q) => ({ label: q.label, count: q.casos }))} color="#94a3b8" emptyLabel={t("charts.noData")} />
                        {comparativoTiemposTrimestral && comparativoTiemposTrimestral.prev.casos > 0 && comparativoTiemposTrimestral.cur.casos > 0 ? (
                          <div style={{ marginTop: 16 }}>
                            <p style={{ ...panelTitleStyle, fontSize: 12 }}>{t("comparativo.title")}</p>
                            <DeltaChip
                              label={t("aprCols.diasPromedio")}
                              current={comparativoTiemposTrimestral.cur.promedioDias ?? 0}
                              previous={comparativoTiemposTrimestral.prev.promedioDias ?? 0}
                              suffix={t("comparativo.vsAnteriorTrimestre")}
                              invertColor
                            />
                          </div>
                        ) : null}
                      </>
                    )}

                    {tiemposView === "anual" && (
                      <>
                        <p style={hintStyle}>{t("aprCols.tendenciaTiemposHintAnual")}</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
                            <div style={{ fontSize: 24, fontWeight: 800, color: "#7c3aed" }}>{tiemposAnnualTotal.promedioDias ?? "—"}</div>
                            <div style={cardLabelStyle}>{t("aprCols.diasPromedio")}</div>
                          </div>
                          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
                            <div style={{ fontSize: 24, fontWeight: 800, color: "#334155" }}>{tiemposAnnualTotal.casos}</div>
                            <div style={cardLabelStyle}>{t("aprCols.casos")}</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{t("aprSections.historial")}</span>
                    <div style={{ flex: "1 1 160px" }}>
                      <label style={labelStyle}>{t("aprCols.resultado")}</label>
                      <select value={aprFilter.resultado} onChange={(e) => setAprFilter((f) => ({ ...f, resultado: e.target.value }))} style={inputStyle}>
                        <option value="">{t("actFilters.allActions")}</option>
                        {Object.entries(RESULTADO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: "1 1 180px" }}>
                      <label style={labelStyle}>{t("actFilters.search")}</label>
                      <input value={aprFilter.search} onChange={(e) => setAprFilter((f) => ({ ...f, search: e.target.value }))} placeholder={t("docFilters.searchPlaceholder")} style={inputStyle} />
                    </div>
                    {JSON.stringify(aprFilter) !== JSON.stringify(DEFAULT_APR_FILTER) && (
                      <button onClick={() => setAprFilter(DEFAULT_APR_FILTER)} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12 }}>
                        <X size={13} /> {t("docFilters.clearDrill")}
                      </button>
                    )}
                    <button
                      onClick={exportAprobacionesExcel}
                      disabled={filteredHistorialAprobaciones.length === 0}
                      style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 7, cursor: filteredHistorialAprobaciones.length ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, opacity: filteredHistorialAprobaciones.length ? 1 : 0.5 }}
                    >
                      <Download size={14} /> {t("exportExcel")}
                    </button>
                  </div>
                  {filteredHistorialAprobaciones.length === 0 ? (
                    <p style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{t("aprCols.emptyHistorial")}</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                            {[t("aprCols.fecha"), t("aprCols.documento"), t("aprCols.codigo"), t("aprCols.tipo"), t("aprCols.resultado"), t("aprCols.decididoPor"), t("aprCols.diasQueTomo")].map((h) => (
                              <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredHistorialAprobaciones.map((r) => {
                            const rl = RESULTADO_LABELS[r.resultado] ?? { label: r.resultado, bg: "#f3f4f6", color: "#374151" };
                            return (
                              <tr key={r.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                                <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(r.fecha)}</td>
                                <td style={{ padding: "11px 16px", fontSize: 13, color: "#1e293b" }}>{r.documento}</td>
                                <td style={{ padding: "11px 16px" }}>{r.codigo !== "—" ? <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{r.codigo}</code> : <span style={{ color: "#d1d5db" }}>—</span>}</td>
                                <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b" }}>{TIPO_LABELS[r.tipo] ?? r.tipo}</td>
                                <td style={{ padding: "11px 16px" }}><span style={{ background: rl.bg, color: rl.color, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{rl.label}</span></td>
                                <td style={{ padding: "11px 16px", fontSize: 13, color: "#374151" }}>{r.decididoPor}</td>
                                <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{r.diasQueTomo} {t("aprCols.diasPromedio")}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
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

            {/* ── CAMBIOS TAB (unified change + version history) ── */}
            {tab === "cambios" && (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{t("detailTitle")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{cambios.length} {t("records")}</span>
                    <button
                      onClick={exportCSV}
                      disabled={cambios.length === 0}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", padding: "7px 14px", borderRadius: 7, cursor: cambios.length ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, opacity: cambios.length ? 1 : 0.6 }}
                    >
                      <Download size={14} /> {t("exportCsv")}
                    </button>
                    <button
                      onClick={exportCambiosExcel}
                      disabled={cambios.length === 0}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: brand, color: "#fff", border: "none", padding: "7px 14px", borderRadius: 7, cursor: cambios.length ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, opacity: cambios.length ? 1 : 0.6 }}
                    >
                      <Download size={14} /> {t("exportExcel")}
                    </button>
                  </div>
                </div>
                {cambios.length === 0 ? (
                  <p style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{t("empty")}</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          {[t("cols.fecha"), t("cols.tipo"), t("cols.documento"), t("cols.codigo"), t("cols.version"), t("cols.motivo"), t("cols.requestedBy"), t("cols.reviewedBy"), t("cols.estado")].map((h) => (
                            <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cambios.map((r, i) => {
                          const st = STATUS_LABELS[r.estado] ?? { label: r.estado, bg: "#f3f4f6", color: "#374151" };
                          return (
                            <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                              <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(r.fecha)}</td>
                              <td style={{ padding: "11px 16px", fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>{TIPO_LABELS[r.tipo] ?? r.tipo}</td>
                              <td style={{ padding: "11px 16px", fontSize: 13, color: "#1e293b", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.documento}</td>
                              <td style={{ padding: "11px 16px" }}>
                                {r.codigo !== "—" ? <code style={{ background: "#f1f5f9", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{r.codigo}</code> : <span style={{ color: "#d1d5db" }}>—</span>}
                              </td>
                              <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{r.version}</td>
                              <td style={{ padding: "11px 16px", fontSize: 12, color: "#64748b", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.motivo}>{r.motivo !== "—" ? r.motivo : <span style={{ color: "#d1d5db" }}>—</span>}</td>
                              <td style={{ padding: "11px 16px", fontSize: 13, color: "#374151" }}>{r.solicitante}</td>
                              <td style={{ padding: "11px 16px", fontSize: 13, color: "#64748b" }}>{r.decididoPor}</td>
                              <td style={{ padding: "11px 16px" }}>
                                <span style={{ background: st.bg, color: st.color, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                              </td>
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
const hintStyle: React.CSSProperties = { fontSize: 11, color: "#94a3b8", margin: "0 0 16px" };
