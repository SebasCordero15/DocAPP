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

interface RevFile {
  id: string;
  name: string;
  codigo: string | null;
  nombreDocumento: string | null;
  fechaRevision: string;
  encargadoDocumento: { name: string; email: string } | null;
  folder: { name: string } | null;
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

  const [activeTab, setActiveTab] = useState<"cambios" | "revisiones">("cambios");

  // ── Registro de Cambios state ──
  const [entries, setEntries]   = useState<ChangeEntry[]>([]);
  const [total,   setTotal]     = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading]   = useState(true);

  const [q,        setQ]        = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [page,     setPage]     = useState(1);

  // ── Próximas Revisiones state ──
  const [revFiles,   setRevFiles]   = useState<RevFile[]>([]);
  const [revLoading, setRevLoading] = useState(false);
  const [revLoaded,  setRevLoaded]  = useState(false);

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

  async function fetchRevisiones() {
    setRevLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/listado-maestro?fechaRevisionFrom=${today}`);
    if (res.ok) {
      const data = await res.json();
      const sorted = (data.files as RevFile[]).filter((f) => f.fechaRevision);
      sorted.sort((a, b) => new Date(a.fechaRevision).getTime() - new Date(b.fechaRevision).getTime());
      setRevFiles(sorted);
    }
    setRevLoading(false);
    setRevLoaded(true);
  }

  function handleTabChange(tab: "cambios" | "revisiones") {
    setActiveTab(tab);
    if (tab === "revisiones" && !revLoaded) fetchRevisiones();
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
          <strong style={{ fontSize: 16 }}>Control de Cambios</strong>
          {activeTab === "cambios" && <span style={{ fontSize: 12, opacity: 0.75 }}>{total} registros</span>}
          {activeTab === "revisiones" && !revLoading && <span style={{ fontSize: 12, opacity: 0.75 }}>{revFiles.length} pendientes</span>}
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.15)", paddingLeft: 16 }}>
          {(["cambios", "revisiones"] as const).map((tab) => {
            const labels = { cambios: "Registro de Cambios", revisiones: "Próximas Revisiones" };
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
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
                }}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Registro de Cambios tab ── */}
      {activeTab === "cambios" && (
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
      )}

      {/* ── Próximas Revisiones tab ── */}
      {activeTab === "revisiones" && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
          {revLoading ? (
            <p style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>Cargando…</p>
          ) : revFiles.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "#94a3b8" }}>
              <p style={{ fontSize: 15, margin: 0 }}>No hay documentos con revisiones programadas.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {revGroups.map(({ label, docs }) => {
                const monthDate = new Date(docs[0].fechaRevision);
                const isCurrentMonth =
                  monthDate.getMonth() === new Date().getMonth() &&
                  monthDate.getFullYear() === new Date().getFullYear();
                return (
                  <div key={label}>
                    {/* Month header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <div style={{
                        background: isCurrentMonth ? brand : "#64748b",
                        color: "#fff",
                        borderRadius: 6,
                        padding: "4px 14px",
                        fontSize: 13,
                        fontWeight: 700,
                        textTransform: "capitalize",
                      }}>
                        {label}
                      </div>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{docs.length} documento{docs.length !== 1 ? "s" : ""}</span>
                    </div>
                    {/* Document cards */}
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                            {["Fecha de Revisión", "Documento", "Código", "Responsable", "Carpeta"].map((h) => (
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
                                    {daysLeft === 0 ? "Hoy" : daysLeft === 1 ? "Mañana" : `En ${daysLeft} días`}
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
                                  {f.folder?.name ?? <span style={{ color: "#d1d5db" }}>Raíz</span>}
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
          )}
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
