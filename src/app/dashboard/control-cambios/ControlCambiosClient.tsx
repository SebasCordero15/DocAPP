"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

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
  estado?: string;
}

interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string; logoUrl: string | null };
  userRole: string;
}

const TIPO_COLORS: Record<string, string> = {
  FILE_UPLOAD:              "#2563eb",
  FILE_DELETE:              "#dc2626",
  FILE_REVIEW_COMPLETE:     "#7c3aed",
  FILE_REVIEW_UPDATE:       "#d97706",
  FILE_METADATA_UPDATE:     "#0891b2",
  FILE_STATUS_UPDATE:       "#16a34a",
  FOLDER_CREATE:            "#0891b2",
  FOLDER_DELETE:            "#dc2626",
  FOLDER_RENAME:            "#d97706",
  FOLDER_MOVE:              "#64748b",
  CHANGE_REQUEST_APPROVED:  "#16a34a",
  CHANGE_REQUEST_REJECTED:  "#dc2626",
  CR_NEW_UPLOAD:            "#2563eb",
  CR_EDIT_METADATA:         "#d97706",
  CR_REPLACE_FILE:          "#7c3aed",
  CR_DELETE:                "#dc2626",
  CR_REVISION_DATE_CHANGE:  "#0891b2",
  CR_OTHER:                 "#64748b",
};

export default function ControlCambiosClient({ company, userRole }: Props) {
  const router = useRouter();
  const brand  = company.primaryColor;

  const [entries, setEntries]   = useState<ChangeEntry[]>([]);
  const [total,   setTotal]     = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading]   = useState(true);

  const [q,        setQ]        = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [page,     setPage]     = useState(1);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (q)        p.set("q", q);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo)   p.set("dateTo", dateTo);
    p.set("page", String(page));
    const res = await fetch(`/api/control-cambios?${p}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
      setPageCount(data.pageCount);
    }
    setLoading(false);
  }, [q, dateFrom, dateTo, page]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  function applySearch() { setPage(1); fetchEntries(); }
  function clearFilters() { setQ(""); setDateFrom(""); setDateTo(""); setPage(1); }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      {/* Header */}
      <header style={{ background: brand, color: "#fff", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => router.push("/dashboard")}
            style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
          >
            ← Dashboard
          </button>
          <strong style={{ fontSize: 16 }}>Control de Cambios</strong>
        </div>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{total} registros</span>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

        {/* Filters */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 200px" }}>
            <label style={labelStyle}>Buscar documento / código / tipo</label>
            <input
              type="text" value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              placeholder="ej. Contrato, DOC-001, subida…"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={labelStyle}>Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={labelStyle}>Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={applySearch} style={{ background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              Buscar
            </button>
            <button onClick={clearFilters} style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
              Limpiar
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
          {loading ? (
            <p style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Cargando…</p>
          ) : entries.length === 0 ? (
            <p style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No hay registros de cambios.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  {["Fecha", "Tipo de Cambio", "Documento", "Código", "Quién", "Detalle"].map((h) => (
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
                            {e.estado === "APPROVED" ? "Aprobado" : "Rechazado"}
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
                      <td style={{ padding: "11px 18px", fontSize: 13, color: "#374151" }}>
                        {e.quien ?? <span style={{ color: "#d1d5db" }}>Sistema</span>}
                      </td>
                      <td style={{ padding: "11px 18px", fontSize: 12, color: "#64748b", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.detalle ?? ""}>
                        {e.detalle ?? <span style={{ color: "#d1d5db" }}>—</span>}
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
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn(page === 1)}>← Ant</button>
            <span style={{ padding: "6px 12px", fontSize: 13, color: "#64748b" }}>Pág. {page} de {pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} style={pageBtn(page === pageCount)}>Sig. →</button>
          </div>
        )}
      </div>
    </main>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, background: "#fff", boxSizing: "border-box" };
const pageBtn = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? "#f1f5f9" : "#fff", color: disabled ? "#94a3b8" : "#2563eb",
  border: "1px solid #e2e8f0", padding: "6px 14px", borderRadius: 7,
  cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
});
