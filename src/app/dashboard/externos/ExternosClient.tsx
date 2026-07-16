"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Globe, Upload, FolderPlus, Folder, FileText, X, Loader2, Trash2, Eye, Download } from "lucide-react";
import FileIcon from "@/components/FileIcon";

interface ExternalFolder {
  id: string;
  name: string;
}

interface ExternalFile {
  id: string;
  name: string;
  nombreDocumento: string;
  folderId: string | null;
  mimeType: string;
  size: number;
  tipoDocumento: string;
  versionStr: string;
  status: string;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string };
  userRole: string;
  currentUserId: string;
}


function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ExternosClient({ company, userRole, currentUserId }: Props) {
  const t  = useTranslations("externos");
  const tc = useTranslations("common");
  const brand   = company.primaryColor;
  const isAdmin = userRole === "COMPANY_ADMIN";
  const canEdit = userRole === "COMPANY_ADMIN" || userRole === "EDITOR";

  const TIPOS = [
    { value: "PROCEDIMIENTO", label: t("tipos.PROCEDIMIENTO") },
    { value: "MANUAL",        label: t("tipos.MANUAL") },
    { value: "INSTRUCTIVO",   label: t("tipos.INSTRUCTIVO") },
    { value: "FORMATO",       label: t("tipos.FORMATO") },
    { value: "POLITICA",      label: t("tipos.POLITICA") },
    { value: "OTRO",          label: t("tipos.OTRO") },
  ];

  const [folders, setFolders] = useState<ExternalFolder[]>([]);
  const [files,   setFiles]   = useState<ExternalFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Upload modal state
  const [showUpload, setShowUpload]         = useState(false);
  const [uploading, setUploading]           = useState(false);
  const [uploadError, setUploadError]       = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    folderId:        "",
    nombreDocumento: "",
    departamento:    "",
    tipoDocumento:   "PROCEDIMIENTO",
  });
  const [pickedFile, setPickedFile] = useState<File | null>(null);

  // New folder modal state (admin)
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  function loadData() {
    setLoading(true);
    fetch("/api/externos")
      .then((r) => r.json())
      .then((d) => {
        setFolders(d.folders ?? []);
        setFiles(d.files ?? []);
        if (d.folders?.length > 0 && !selectedFolderId) {
          setSelectedFolderId(d.folders[0].id);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  const folderFiles = files.filter((f) => f.folderId === selectedFolderId);
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  function openUpload() {
    setForm((prev) => ({ ...prev, folderId: selectedFolderId ?? "" }));
    setPickedFile(null);
    setUploadError(null);
    setUploadProgress(0);
    setShowUpload(true);
  }

  async function handleUpload() {
    if (!pickedFile) { setUploadError(t("errors.noFile")); return; }
    if (!form.folderId) { setUploadError(t("errors.noFolder")); return; }
    if (!form.nombreDocumento.trim()) { setUploadError(t("errors.noNombre")); return; }
    if (!form.departamento.trim()) { setUploadError(t("errors.noDept")); return; }

    setUploading(true);
    setUploadError(null);

    try {
      // 1. Get presigned upload URL
      const urlRes = await fetch("/api/files/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: form.folderId,
          name: pickedFile.name,
          mimeType: pickedFile.type || "application/octet-stream",
          size: pickedFile.size,
        }),
      });
      if (!urlRes.ok) {
        const e = await urlRes.json().catch(() => ({}));
        throw new Error(e.error ?? t("errors.uploadUrl"));
      }
      const { uploadUrl, storageKey } = await urlRes.json();

      // 2. Upload file to storage
      setUploadProgress(30);
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: pickedFile,
        headers: { "Content-Type": pickedFile.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error(t("errors.uploadFile"));
      setUploadProgress(70);

      // 3. Create document record (no reviewers — folder is external)
      const createRes = await fetch("/api/crear-documento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey,
          name: pickedFile.name,
          mimeType: pickedFile.type || "application/octet-stream",
          size: pickedFile.size,
          nombreDocumento: form.nombreDocumento.trim(),
          departamento: form.departamento.trim(),
          tipoDocumento: form.tipoDocumento,
          versionStr: "v1.0",
          folderId: form.folderId,
          reviewerIds: [],
          codigo: null,
        }),
      });
      if (!createRes.ok) {
        const e = await createRes.json().catch(() => ({}));
        throw new Error(e.error ?? t("errors.createDoc"));
      }
      setUploadProgress(100);
      setShowUpload(false);
      loadData();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("errors.unexpected"));
    } finally {
      setUploading(false);
    }
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/externos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (!res.ok) throw new Error(t("errors.createFolder"));
      const { folder } = await res.json();
      setFolders((prev) => [...prev, folder]);
      setSelectedFolderId(folder.id);
      setNewFolderName("");
      setShowNewFolder(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("errors.unexpected"));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function deleteFile(fileId: string, fileName: string) {
    if (!confirm(t("deleteConfirm", { name: fileName }))) return;
    await fetch(`/api/files/${fileId}`, { method: "DELETE" });
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  async function viewFile(fileId: string) {
    const res = await fetch(`/api/files/${fileId}/view-url`);
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  async function downloadFile(fileId: string) {
    const res = await fetch(`/api/files/${fileId}/download-url`);
    if (!res.ok) return;
    const { url } = await res.json();
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.click();
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f5f7fa", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>

      {/* Header */}
      <div style={{ background: brand, color: "#fff", padding: "12px 28px", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <Globe size={18} />
        <strong style={{ fontSize: 16 }}>{t("header")}</strong>
        <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75 }}>{t("headerSub")}</span>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Left: folder sidebar */}
        <aside style={{ width: 220, background: "#fff", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>{t("foldersLabel")}</span>
            {isAdmin && (
              <button
                onClick={() => setShowNewFolder(true)}
                title="Nueva carpeta externa"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: brand, padding: 2, display: "flex" }}
              >
                <FolderPlus size={16} />
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
            {loading ? (
              <p style={{ fontSize: 13, color: "#aaa", padding: "8px 4px" }}>{t("loadingFolders")}</p>
            ) : folders.length === 0 ? (
              <div style={{ padding: "16px 8px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#aaa", margin: 0 }}>{t("noFolders")}</p>
                {isAdmin && (
                  <button
                    onClick={() => setShowNewFolder(true)}
                    style={{ marginTop: 10, background: brand, color: "#fff", border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                  >
                    {t("createFolder")}
                  </button>
                )}
              </div>
            ) : (
              folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFolderId(f.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                    background: selectedFolderId === f.id ? brand : "transparent",
                    color: selectedFolderId === f.id ? "#fff" : "#334155",
                    fontSize: 13, fontWeight: selectedFolderId === f.id ? 600 : 400,
                    marginBottom: 2, textAlign: "left",
                  }}
                >
                  <Folder size={15} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Right: files list */}
        <section style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {!selectedFolder ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#aaa", gap: 12 }}>
              <Globe size={40} strokeWidth={1} />
              <p style={{ margin: 0, fontSize: 14 }}>
                {folders.length === 0
                  ? (isAdmin ? t("noFolderAdmin") : t("noFolderUser"))
                  : t("noFolderSelected")}
              </p>
            </div>
          ) : (
            <>
              {/* Folder header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Folder size={20} color={brand} />
                  <h2 style={{ margin: 0, fontSize: 18, color: "#1e293b" }}>{selectedFolder.name}</h2>
                  <span style={{ background: "#e0f2fe", color: "#0369a1", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>
                    {t("docCount", { count: folderFiles.length })}
                  </span>
                </div>
                {canEdit && (
                  <button
                    onClick={openUpload}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                  >
                    <Upload size={15} />
                    {t("uploadBtn")}
                  </button>
                )}
              </div>

              {/* Notice */}
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#0369a1" }}>
                {t("externalNotice")}
              </div>

              {/* Files table */}
              {folderFiles.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px", color: "#aaa" }}>
                  <FileText size={36} strokeWidth={1} style={{ marginBottom: 12 }} />
                  <p style={{ margin: 0, fontSize: 14 }}>{t("emptyFolder")}</p>
                  {canEdit && (
                    <button
                      onClick={openUpload}
                      style={{ marginTop: 14, background: brand, color: "#fff", border: "none", padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                    >
                      {t("uploadFirst")}
                    </button>
                  )}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                      {[t("tableHeaders.documento"), tc("tipo"), tc("version"), t("tableHeaders.subidoPor"), t("tableHeaders.fecha"), ""].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {folderFiles.map((f) => (
                      <tr key={f.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <FileIcon mimeType={f.mimeType} size={16} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{f.nombreDocumento}</div>
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>{f.name}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{f.tipoDocumento}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ background: "#f1f5f9", color: "#475569", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4 }}>{f.versionStr}</span>
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{f.uploadedBy?.name ?? "—"}</td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8" }}>{fmtDate(f.createdAt)}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => viewFile(f.id)} title={tc("ver")} style={actionBtnStyle}><Eye size={13} /></button>
                            <button onClick={() => downloadFile(f.id)} title={tc("descargar")} style={actionBtnStyle}><Download size={13} /></button>
                            {(isAdmin || f.uploadedBy?.id === currentUserId) && (
                              <button onClick={() => deleteFile(f.id, f.nombreDocumento)} title={tc("eliminar")} style={{ ...actionBtnStyle, color: "#ef4444", borderColor: "#fecaca" }}><Trash2 size={13} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </section>
      </div>

      {/* ── Upload modal ──────────────────────────────────────────────── */}
      {showUpload && (
        <div style={overlayStyle} onClick={() => !uploading && setShowUpload(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#1e293b" }}>{t("uploadModal.title")}</h3>
              {!uploading && <button onClick={() => setShowUpload(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>}
            </div>

            {/* Carpeta */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t("uploadModal.folderLabel")}</label>
              <select
                value={form.folderId}
                onChange={(e) => setForm((p) => ({ ...p, folderId: e.target.value }))}
                style={inputStyle}
                disabled={uploading}
              >
                <option value="">{t("uploadModal.folderPlaceholder")}</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>

            {/* Archivo */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t("uploadModal.fileLabel")}</label>
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${pickedFile ? brand : "#cbd5e1"}`,
                  borderRadius: 8, padding: "14px 16px", cursor: uploading ? "default" : "pointer",
                  textAlign: "center", background: pickedFile ? "#f0fdf4" : "#f8fafc",
                }}
              >
                {pickedFile ? (
                  <div style={{ fontSize: 13, color: "#15803d" }}>
                    <strong>{pickedFile.name}</strong><br />
                    <span style={{ fontSize: 11, color: "#64748b" }}>{fmtSize(pickedFile.size)}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>
                    <Upload size={20} style={{ marginBottom: 6 }} /><br />
                    {t("uploadModal.filePrompt")}
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)} />
            </div>

            {/* Nombre */}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t("uploadModal.nombreLabel")}</label>
              <input
                value={form.nombreDocumento}
                onChange={(e) => setForm((p) => ({ ...p, nombreDocumento: e.target.value }))}
                placeholder={t("uploadModal.nombrePlaceholder")}
                style={inputStyle}
                disabled={uploading}
              />
            </div>

            {/* Tipo + Departamento row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>{t("uploadModal.tipoLabel")}</label>
                <select value={form.tipoDocumento} onChange={(e) => setForm((p) => ({ ...p, tipoDocumento: e.target.value }))} style={inputStyle} disabled={uploading}>
                  {TIPOS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("uploadModal.deptLabel")}</label>
                <input value={form.departamento} onChange={(e) => setForm((p) => ({ ...p, departamento: e.target.value }))} placeholder={t("uploadModal.deptPlaceholder")} style={inputStyle} disabled={uploading} />
              </div>
            </div>

            {uploadError && (
              <p style={{ margin: "0 0 12px", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>{uploadError}</p>
            )}

            {uploading && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${uploadProgress}%`, background: brand, transition: "width 0.3s ease" }} />
                </div>
                <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, textAlign: "center" }}>{t("uploadModal.uploading")}</p>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {!uploading && (
                <button onClick={() => setShowUpload(false)} style={{ border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>{tc("cancel")}</button>
              )}
              <button
                onClick={handleUpload}
                disabled={uploading}
                style={{ background: brand, color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, cursor: uploading ? "default" : "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: uploading ? 0.7 : 1 }}
              >
                {uploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />}
                {uploading ? t("uploadModal.uploading") : t("uploadModal.upload")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New folder modal (admin) ─────────────────────────────────── */}
      {showNewFolder && (
        <div style={overlayStyle} onClick={() => setShowNewFolder(false)}>
          <div style={{ ...modalStyle, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{t("folderModal.title")}</h3>
              <button onClick={() => setShowNewFolder(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t("folderModal.nameLabel")}</label>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createFolder()}
                placeholder={t("folderModal.namePlaceholder")}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button onClick={() => setShowNewFolder(false)} style={{ border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>{tc("cancel")}</button>
              <button
                onClick={createFolder}
                disabled={creatingFolder || !newFolderName.trim()}
                style={{ background: brand, color: "#fff", border: "none", padding: "8px 18px", borderRadius: 8, cursor: creatingFolder ? "default" : "pointer", fontSize: 13, fontWeight: 600, opacity: (!newFolderName.trim() || creatingFolder) ? 0.6 : 1 }}
              >
                {creatingFolder ? t("folderModal.creating") : t("folderModal.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
  alignItems: "center", justifyContent: "center", zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 540,
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto",
};

const fieldStyle: React.CSSProperties = { marginBottom: 12 };

const labelStyle: React.CSSProperties = {
  display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#475569",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 7,
  fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff",
};

const actionBtnStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b",
  borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center",
};
