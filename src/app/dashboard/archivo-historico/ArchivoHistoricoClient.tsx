"use client";

import { useState, useEffect, useRef } from "react";
import { Archive, RotateCcw, Eye, Download, Paperclip, Trash2, X, Upload, Loader2, FileText } from "lucide-react";
import FileIcon from "@/components/FileIcon";

interface ObsoleteFile {
  id: string;
  name: string;
  nombreDocumento: string | null;
  codigo: string | null;
  mimeType: string;
  size: number;
  tipoDocumento: string | null;
  versionStr: string | null;
  departamento: string | null;
  createdAt: string;
  updatedAt: string;
  comparisonStorageKey: string | null;
  comparisonName: string | null;
  folder: { id: string; name: string } | null;
  uploadedBy: { id: string; name: string } | null;
  lastEditedBy: { id: string; name: string } | null;
}

interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArchivoHistoricoClient({ company }: Props) {
  const brand = company.primaryColor;

  const [files,   setFiles]   = useState<ObsoleteFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);

  // Comparison modal state
  const [compModal, setCompModal] = useState<ObsoleteFile | null>(null);
  const [compFile,  setCompFile]  = useState<File | null>(null);
  const [compUploading, setCompUploading] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);
  const compInputRef = useRef<HTMLInputElement>(null);

  function loadFiles() {
    setLoading(true);
    fetch("/api/archivo-historico")
      .then((r) => r.json())
      .then((d) => setFiles(d.files ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadFiles(); }, []);

  async function restore(fileId: string, docName: string) {
    if (!confirm(`¿Restaurar "${docName}" como documento activo?`)) return;
    setRestoring(fileId);
    try {
      await fetch(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REVIEWED" }),
      });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } finally {
      setRestoring(null);
    }
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
    setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, comparisonStorageKey: null, comparisonName: null } : f));
  }

  async function handleCompUpload() {
    if (!compModal || !compFile) { setCompError("Selecciona un archivo."); return; }
    setCompUploading(true);
    setCompError(null);
    try {
      // Step 1: get presigned URL
      const urlRes = await fetch(`/api/files/${compModal.id}/comparison`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: compFile.name, mimeType: compFile.type || "application/octet-stream", size: compFile.size }),
      });
      if (!urlRes.ok) { const e = await urlRes.json().catch(() => ({})); throw new Error(e.error ?? "Error al obtener URL."); }
      const { uploadUrl, storageKey } = await urlRes.json();

      // Step 2: upload
      const putRes = await fetch(uploadUrl, { method: "PUT", body: compFile, headers: { "Content-Type": compFile.type || "application/octet-stream" } });
      if (!putRes.ok) throw new Error("Error al subir el archivo.");

      // Step 3: save key
      const saveRes = await fetch(`/api/files/${compModal.id}/comparison`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey, name: compFile.name }),
      });
      if (!saveRes.ok) throw new Error("Error al guardar la comparativa.");

      setFiles((prev) => prev.map((f) => f.id === compModal.id ? { ...f, comparisonStorageKey: storageKey, comparisonName: compFile.name } : f));
      setCompModal(null);
      setCompFile(null);
    } catch (err) {
      setCompError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCompUploading(false);
    }
  }

  const filtered = files.filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (f.nombreDocumento ?? "").toLowerCase().includes(q) ||
      (f.codigo ?? "").toLowerCase().includes(q) ||
      (f.folder?.name ?? "").toLowerCase().includes(q) ||
      (f.departamento ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f5f7fa", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>

      {/* Header */}
      <div style={{ background: brand, color: "#fff", padding: "12px 28px", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <Archive size={18} />
        <strong style={{ fontSize: 16 }}>Archivo Histórico</strong>
        <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.18)", borderRadius: 10, padding: "2px 10px", fontSize: 12 }}>
          {files.length} documento{files.length !== 1 ? "s" : ""} obsoleto{files.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Search bar */}
      <div style={{ padding: "14px 24px 0", flexShrink: 0 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, código, carpeta, departamento…"
          style={{ width: "100%", maxWidth: 440, padding: "8px 14px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* Notice */}
      <div style={{ margin: "12px 24px 0", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "9px 14px", fontSize: 12, color: "#92400e" }}>
        Los documentos obsoletos no aparecen en el dashboard principal ni en el Listado Maestro. Se pueden restaurar en cualquier momento.
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
        {loading ? (
          <p style={{ color: "#aaa", fontSize: 14 }}>Cargando…</p>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: "#aaa", gap: 12 }}>
            <Archive size={40} strokeWidth={1} />
            <p style={{ margin: 0, fontSize: 14 }}>
              {files.length === 0 ? "No hay documentos obsoletos." : "Sin resultados para esa búsqueda."}
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                {["Documento", "Carpeta", "Tipo", "Versión", "Archivado el", "Comparativa", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid #f8fafc" }}>

                  {/* Document */}
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

                  {/* Folder */}
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>
                    {f.folder?.name ?? <span style={{ color: "#cbd5e1" }}>Sin carpeta</span>}
                  </td>

                  {/* Type */}
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>{f.tipoDocumento ?? "—"}</td>

                  {/* Version */}
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ background: "#f1f5f9", color: "#475569", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4 }}>{f.versionStr ?? "—"}</span>
                  </td>

                  {/* Archived date */}
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#94a3b8" }}>{fmtDate(f.updatedAt)}</td>

                  {/* Comparison doc */}
                  <td style={{ padding: "11px 14px" }}>
                    {f.comparisonStorageKey ? (
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => viewComparison(f.id)}
                          style={{ display: "flex", alignItems: "center", gap: 4, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                        >
                          <Eye size={12} /> Ver
                        </button>
                        <button
                          onClick={() => { setCompModal(f); setCompFile(null); setCompError(null); }}
                          style={{ display: "flex", alignItems: "center", gap: 4, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11 }}
                          title="Reemplazar comparativa"
                        >
                          <Upload size={12} />
                        </button>
                        <button
                          onClick={() => deleteComparison(f.id)}
                          style={{ display: "flex", alignItems: "center", background: "#fff0f0", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 7px", cursor: "pointer" }}
                          title="Quitar comparativa"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setCompModal(f); setCompFile(null); setCompError(null); }}
                        style={{ display: "flex", alignItems: "center", gap: 5, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}
                      >
                        <Paperclip size={12} /> Adjuntar
                      </button>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "11px 14px" }}>
                    <button
                      onClick={() => restore(f.id, f.nombreDocumento || f.name)}
                      disabled={restoring === f.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: brand, color: "#fff", border: "none",
                        borderRadius: 7, padding: "6px 12px", cursor: restoring === f.id ? "default" : "pointer",
                        fontSize: 12, fontWeight: 600, opacity: restoring === f.id ? 0.6 : 1,
                      }}
                    >
                      {restoring === f.id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RotateCcw size={13} />}
                      Restaurar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Comparison upload modal ─────────────────────────────────────── */}
      {compModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => !compUploading && setCompModal(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
                <Paperclip size={16} color={brand} />
                {compModal.comparisonStorageKey ? "Reemplazar comparativa" : "Adjuntar comparativa"}
              </h3>
              {!compUploading && <button onClick={() => setCompModal(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>}
            </div>

            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>
              Documento: <strong>{compModal.nombreDocumento || compModal.name}</strong>
            </p>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>
              Adjunta el .docx con control de cambios (marcas rojas) o cualquier versión comparativa.
            </p>

            <div
              onClick={() => !compUploading && compInputRef.current?.click()}
              style={{
                border: `2px dashed ${compFile ? brand : "#cbd5e1"}`,
                borderRadius: 8, padding: "16px", cursor: compUploading ? "default" : "pointer",
                textAlign: "center", background: compFile ? "#f0fdf4" : "#f8fafc", marginBottom: 14,
              }}
            >
              {compFile ? (
                <div style={{ fontSize: 13, color: "#15803d" }}>
                  <strong>{compFile.name}</strong><br />
                  <span style={{ fontSize: 11, color: "#64748b" }}>{(compFile.size / 1024).toFixed(1)} KB</span>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  <FileText size={20} style={{ marginBottom: 6 }} /><br />
                  Haz clic para seleccionar archivo (.docx, .pdf, etc.)
                </div>
              )}
            </div>
            <input ref={compInputRef} type="file" style={{ display: "none" }} onChange={(e) => setCompFile(e.target.files?.[0] ?? null)} />

            {compError && (
              <p style={{ margin: "0 0 12px", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>{compError}</p>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {!compUploading && <button onClick={() => setCompModal(null)} style={{ border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Cancelar</button>}
              <button
                onClick={handleCompUpload}
                disabled={compUploading || !compFile}
                style={{ background: brand, color: "#fff", border: "none", padding: "7px 18px", borderRadius: 8, cursor: (compUploading || !compFile) ? "default" : "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: (!compFile || compUploading) ? 0.6 : 1 }}
              >
                {compUploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />}
                {compUploading ? "Subiendo…" : "Adjuntar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
