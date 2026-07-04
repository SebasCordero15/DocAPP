"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import FileIcon from "@/components/FileIcon";

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
  controlCambios: string | null;
  encargadoDocumentoId: string | null;
  encargadoDocumento: { id: string; name: string; email: string } | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
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
  const brand = company.primaryColor;
  const canEdit = userRole === "COMPANY_ADMIN" || userRole === "EDITOR";

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

  // ── sort ──────────────────────────────────────────────────────────────────
  type SortKey = "codigo" | "nombre" | "version" | "fechaEmision" | "fechaRevision" | "fechaActualizacion" | "encargado";
  const [sortKey, setSortKey] = useState<SortKey>("fechaEmision");
  const [sortAsc, setSortAsc] = useState(false);

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
    setSaving(true);
    const body: Record<string, unknown> = {
      codigo:               editForm.codigo || null,
      nombreDocumento:      editForm.nombreDocumento || null,
      versionStr:           editForm.versionStr || null,
      fechaEmision:         editForm.fechaEmision ? new Date(editForm.fechaEmision).toISOString() : null,
      fechaRevision:        editForm.fechaRevision ? new Date(editForm.fechaRevision).toISOString() : null,
      fechaActualizacion:   editForm.fechaActualizacion ? new Date(editForm.fechaActualizacion).toISOString() : null,
      controlCambios:       editForm.controlCambios || null,
      encargadoDocumentoId: editForm.encargadoDocumentoId || null,
    };
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
      "Código":                  f.codigo ?? "",
      "Nombre del documento":    f.nombreDocumento ?? f.name,
      "Versión":                 f.versionStr ?? "",
      "Fecha de emisión":        fmtDate(f.fechaEmision),
      "Fecha de revisión":       fmtDate(f.fechaRevision),
      "Fecha de actualización":  fmtDate(f.fechaActualizacion),
      "Control de cambios":      f.controlCambios ?? "",
      "Encargado de documento":  f.encargadoDocumento?.name ?? "",
      "Carpeta":                 f.folder?.name ?? "Raíz",
      "Archivo":                 f.name,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Listado Maestro");
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
    <div style={{ flex: 1, overflowY: "auto", background: "#f5f7fa" }}>

      {/* Section header */}
      <div style={{ background: brand, color: "#fff", padding: "12px 28px", position: "sticky", top: 0, zIndex: 10 }}>
        <strong style={{ fontSize: 16 }}>Listado Maestro</strong>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 28px" }}>

        {/* ── Filters ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <strong style={{ fontSize: 13, color: "#374151" }}>Filtros</strong>
            <div style={{ display: "flex", gap: 10 }}>
              {hasFilters && (
                <button onClick={clearFilters} style={{ ...ghostBtn, fontSize: 12 }}>Limpiar filtros</button>
              )}
              <button onClick={exportExcel} style={{ background: "#16a34a", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                ↓ Exportar Excel
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div>
              <label style={lbl}>Código</label>
              <input value={fCodigo} onChange={(e) => setFCodigo(e.target.value)} placeholder="Buscar código…" style={inp} />
            </div>
            <div>
              <label style={lbl}>Nombre del documento</label>
              <input value={fNombre} onChange={(e) => setFNombre(e.target.value)} placeholder="Buscar nombre…" style={inp} />
            </div>
            <div>
              <label style={lbl}>Versión</label>
              <input value={fVersion} onChange={(e) => setFVersion(e.target.value)} placeholder="v1.0…" style={inp} />
            </div>
            <div>
              <label style={lbl}>Encargado</label>
              <select value={fEncargado} onChange={(e) => setFEncargado(e.target.value)} style={inp}>
                <option value="">Todos</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Emisión desde</label>
              <input type="date" value={fEmisionFrom} onChange={(e) => setFEmisionFrom(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Emisión hasta</label>
              <input type="date" value={fEmisionTo} onChange={(e) => setFEmisionTo(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Revisión desde</label>
              <input type="date" value={fRevisionFrom} onChange={(e) => setFRevisionFrom(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Revisión hasta</label>
              <input type="date" value={fRevisionTo} onChange={(e) => setFRevisionTo(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Actualización desde</label>
              <input type="date" value={fActFrom} onChange={(e) => setFActFrom(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Actualización hasta</label>
              <input type="date" value={fActTo} onChange={(e) => setFActTo(e.target.value)} style={inp} />
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              {loading ? "Cargando…" : `${sorted.length} documento${sorted.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          {loading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>Cargando…</div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>
              <p style={{ margin: 0, fontSize: 15 }}>No se encontraron documentos.</p>
              {hasFilters && <p style={{ margin: "8px 0 0", fontSize: 13 }}>Prueba ajustando los filtros.</p>}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", background: "#f8fafc" }}>
                    <SortTh label="Código" k="codigo" />
                    <SortTh label="Nombre del documento" k="nombre" />
                    <SortTh label="Versión" k="version" />
                    <SortTh label="Fecha de emisión" k="fechaEmision" />
                    <SortTh label="Fecha de revisión" k="fechaRevision" />
                    <SortTh label="Fecha de actualización" k="fechaActualizacion" />
                    <th style={th}>Control de cambios</th>
                    <SortTh label="Encargado" k="encargado" />
                    <th style={th}>Acciones</th>
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
                        <td style={{ ...td, maxWidth: 220 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <FileIcon mimeType={f.mimeType} size={15} />
                            <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {f.nombreDocumento ?? f.name}
                            </span>
                          </div>
                          {f.folder && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{f.folder.name}</div>}
                        </td>
                        <td style={td}>{f.versionStr ?? <span style={{ color: "#d1d5db" }}>—</span>}</td>
                        <td style={td}>{fmtDate(f.fechaEmision)}</td>
                        <td style={td}>{fmtDate(f.fechaRevision)}</td>
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
                            <button onClick={() => downloadFile(f.id)} style={{ ...ghostBtn, fontSize: 11, padding: "3px 8px" }}>↓ Ver</button>
                            {canEdit && (
                              <button
                                onClick={() => editingId === f.id ? setEditingId(null) : startEdit(f)}
                                style={{ ...ghostBtn, fontSize: 11, padding: "3px 8px", color: editingId === f.id ? "#dc2626" : "#374151" }}
                              >
                                {editingId === f.id ? "Cancelar" : "Editar"}
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
                                <label style={lbl}>Código</label>
                                <input value={editForm.codigo} onChange={(e) => setEditForm({ ...editForm, codigo: e.target.value })} style={inp} placeholder="DOC-001" />
                              </div>
                              <div>
                                <label style={lbl}>Nombre del documento</label>
                                <input value={editForm.nombreDocumento} onChange={(e) => setEditForm({ ...editForm, nombreDocumento: e.target.value })} style={inp} placeholder={f.name} />
                              </div>
                              <div>
                                <label style={lbl}>Versión</label>
                                <input value={editForm.versionStr} onChange={(e) => setEditForm({ ...editForm, versionStr: e.target.value })} style={inp} placeholder="v1.0" />
                              </div>
                              <div>
                                <label style={lbl}>Encargado</label>
                                <select value={editForm.encargadoDocumentoId} onChange={(e) => setEditForm({ ...editForm, encargadoDocumentoId: e.target.value })} style={inp}>
                                  <option value="">Sin asignar</option>
                                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={lbl}>Fecha de emisión</label>
                                <input type="date" value={editForm.fechaEmision} onChange={(e) => setEditForm({ ...editForm, fechaEmision: e.target.value })} style={inp} />
                              </div>
                              <div>
                                <label style={lbl}>Fecha de revisión</label>
                                <input type="date" value={editForm.fechaRevision} onChange={(e) => setEditForm({ ...editForm, fechaRevision: e.target.value })} style={inp} />
                              </div>
                              <div>
                                <label style={lbl}>Fecha de actualización</label>
                                <input type="date" value={editForm.fechaActualizacion} onChange={(e) => setEditForm({ ...editForm, fechaActualizacion: e.target.value })} style={inp} />
                              </div>
                              <div style={{ gridColumn: "span 2" }}>
                                <label style={lbl}>Control de cambios</label>
                                <textarea
                                  value={editForm.controlCambios}
                                  onChange={(e) => setEditForm({ ...editForm, controlCambios: e.target.value })}
                                  rows={3}
                                  style={{ ...inp, resize: "vertical" }}
                                  placeholder="Descripción de cambios…"
                                />
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                              <button
                                onClick={() => saveEdit(f.id)}
                                disabled={saving}
                                style={{ background: brand, color: "#fff", border: "none", padding: "7px 18px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
                              >
                                {saving ? "Guardando…" : "Guardar"}
                              </button>
                              <button onClick={() => setEditingId(null)} style={ghostBtn}>Cancelar</button>
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
