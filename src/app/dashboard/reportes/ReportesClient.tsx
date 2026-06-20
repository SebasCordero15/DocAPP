"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Download, BarChart2, FileCheck, FileX, Upload, Trash2, Clock } from "lucide-react";

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

interface UserOption { id: string; name: string; email: string; }
interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string };
}

const TIPO_LABELS: Record<string, string> = {
  NEW_UPLOAD:           "Nueva subida",
  EDIT_METADATA:        "Edición de metadatos",
  REPLACE_FILE:         "Reemplazo de archivo",
  DELETE:               "Eliminación",
  REVISION_DATE_CHANGE: "Cambio de fecha de revisión",
  OTHER:                "Cambio de documento",
};

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  APPROVED: { label: "Aprobado",  bg: "#dcfce7", color: "#166534" },
  REJECTED: { label: "Rechazado", bg: "#fee2e2", color: "#dc2626" },
  PENDING:  { label: "Pendiente", bg: "#fef3c7", color: "#92400e" },
};

export default function ReportesClient({ company }: Props) {
  const router = useRouter();
  const brand  = company.primaryColor;

  const [summary, setSummary]   = useState<Summary | null>(null);
  const [details, setDetails]   = useState<DetailRow[]>([]);
  const [users,   setUsers]     = useState<UserOption[]>([]);
  const [total,   setTotal]     = useState(0);
  const [loading, setLoading]   = useState(true);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [userId,   setUserId]   = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo)   p.set("dateTo",   dateTo);
    if (userId)   p.set("userId",   userId);
    const res = await fetch(`/api/reportes?${p}`);
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);
      setDetails(data.details);
      setUsers(data.users);
      setTotal(data.total);
    }
    setLoading(false);
  }, [dateFrom, dateTo, userId]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function exportCSV() {
    const headers = ["Fecha", "Tipo", "Documento", "Código", "Solicitado por", "Estado", "Revisado por", "Fecha revisión", "Notas"];
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

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const STAT_CARDS = summary ? [
    { label: "Subidas",       value: summary.subidas,       icon: <Upload size={20} />,    color: "#2563eb" },
    { label: "Eliminaciones", value: summary.eliminaciones, icon: <Trash2 size={20} />,    color: "#dc2626" },
    { label: "Revisiones",    value: summary.revisiones,    icon: <FileCheck size={20} />, color: "#7c3aed" },
    { label: "Aprobadas",     value: summary.aprobadas,     icon: <FileCheck size={20} />, color: "#16a34a" },
    { label: "Rechazadas",    value: summary.rechazadas,    icon: <FileX size={20} />,     color: "#dc2626" },
    { label: "Pendientes",    value: summary.pendientes,    icon: <Clock size={20} />,     color: "#d97706" },
  ] : [];

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      <header style={{ background: brand, color: "#fff", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => router.push("/dashboard")} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
            ← Dashboard
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart2 size={18} />
            <strong style={{ fontSize: 16 }}>Reporte de Cambios</strong>
          </div>
        </div>
        <button
          onClick={exportCSV}
          disabled={details.length === 0}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "7px 14px", borderRadius: 7, cursor: details.length ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, opacity: details.length ? 1 : 0.6 }}
        >
          <Download size={14} /> Exportar CSV
        </button>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

        {/* Filters */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px", marginBottom: 24, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 140px" }}>
            <label style={labelStyle}>Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label style={labelStyle}>Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: "2 1 180px" }}>
            <label style={labelStyle}>Usuario</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} style={inputStyle}>
              <option value="">Todos los usuarios</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <button onClick={fetchReport} style={{ background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            Aplicar
          </button>
          <button onClick={() => { setDateFrom(""); setDateTo(""); setUserId(""); }} style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
            Limpiar
          </button>
        </div>

        {/* Summary cards */}
        {!loading && summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
            {STAT_CARDS.map((s) => (
              <div key={s.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px" }}>
                <div style={{ color: s.color, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Detail table */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Detalle de solicitudes</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{total} registros</span>
          </div>
          {loading ? (
            <p style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Cargando…</p>
          ) : details.length === 0 ? (
            <p style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No hay datos para el período seleccionado.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {["Fecha", "Tipo", "Documento", "Código", "Solicitado por", "Estado", "Revisado por", "Notas"].map((h) => (
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
      </div>
    </main>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, background: "#fff", boxSizing: "border-box" };
