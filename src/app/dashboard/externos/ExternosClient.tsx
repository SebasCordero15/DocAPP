"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Globe, Upload, FolderPlus, Folder, FileText, X, Loader2,
  Trash2, Eye, Download, ChevronRight, ChevronLeft, Pencil, Plus,
} from "lucide-react";
import FileIcon from "@/components/FileIcon";
import FileViewerModal, { isViewable, type ViewableFile } from "@/components/FileViewerModal";

interface ExternalFolder {
  id: string;
  name: string;
  parentId?: string | null;
  isExternal?: boolean;
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
  uploadedBy?: { id: string; name: string } | null;
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

  const [rootFolders, setRootFolders]   = useState<ExternalFolder[]>([]);
  const [loading, setLoading]           = useState(true);

  const [navStack, setNavStack]         = useState<{ id: string; name: string }[]>([]);
  const [currentSubfolders, setCurrentSubfolders] = useState<ExternalFolder[]>([]);
  const [currentFiles, setCurrentFiles] = useState<ExternalFile[]>([]);
  const [navLoading, setNavLoading]     = useState(false);

  const currentFolderId   = navStack.length > 0 ? navStack[navStack.length - 1].id : null;
  const currentFolderName = navStack.length > 0 ? navStack[navStack.length - 1].name : "";

  const [renamingId, setRenamingId]     = useState<string | null>(null);
  const [renameValue, setRenameValue]   = useState("");

  const [showUpload, setShowUpload]         = useState(false);
  const [uploading, setUploading]           = useState(false);
  const [uploadError, setUploadError]       = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ nombreDocumento: "", departamento: "", tipoDocumento: "PROCEDIMIENTO" });
  const [pickedFile, setPickedFile] = useState<File | null>(null);

  const [showNewFolder, setShowNewFolder]   = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName]   = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [viewerFile, setViewerFile] = useState<ViewableFile | null>(null);

  // ── Inline new-root-folder form ─────────────────────────────────────────────
  const [showRootForm, setShowRootForm]   = useState(false);
  const [rootFormName, setRootFormName]   = useState("");
  const [creatingRoot, setCreatingRoot]   = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────

  function loadRootFolders() {
    setLoading(true);
    fetch("/api/externos")
      .then((r) => r.json())
      .then((d) => { setRootFolders(d.folders ?? []); })
      .finally(() => setLoading(false));
  }

  async function fetchFolder(folderId: string) {
    setNavLoading(true);
    try {
      const res = await fetch(`/api/folders/${folderId}`);
      const d   = await res.json();
      setCurrentSubfolders(d.subfolders ?? []);
      setCurrentFiles(d.files ?? []);
    } finally {
      setNavLoading(false);
    }
  }

  useEffect(() => { loadRootFolders(); }, []);

  // ── Navigation ────────────────────────────────────────────────────────────────

  function navigateToRoot() {
    setNavStack([]);
    setCurrentSubfolders([]);
    setCurrentFiles([]);
  }

  function selectRoot(folder: ExternalFolder) {
    if (renamingId) return;
    setNavStack([{ id: folder.id, name: folder.name }]);
    fetchFolder(folder.id);
  }

  function navigateInto(folder: ExternalFolder) {
    setNavStack(prev => [...prev, { id: folder.id, name: folder.name }]);
    fetchFolder(folder.id);
  }

  function navigateToCrumb(idx: number) {
    const newStack = navStack.slice(0, idx + 1);
    setNavStack(newStack);
    fetchFolder(newStack[newStack.length - 1].id);
  }

  function navigateBack() {
    if (navStack.length <= 1) { navigateToRoot(); }
    else {
      const newStack = navStack.slice(0, -1);
      setNavStack(newStack);
      fetchFolder(newStack[newStack.length - 1].id);
    }
  }

  // ── Folder actions ────────────────────────────────────────────────────────────

  function openNewFolder(parentId: string | null) {
    setNewFolderParentId(parentId);
    setNewFolderName("");
    setShowNewFolder(true);
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      if (newFolderParentId === null) {
        const res = await fetch("/api/externos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newFolderName.trim() }),
        });
        if (!res.ok) throw new Error(t("errors.createFolder"));
        const { folder } = await res.json();
        setRootFolders(prev => [...prev, folder]);
        setNavStack([{ id: folder.id, name: folder.name }]);
        fetchFolder(folder.id);
      } else {
        const res = await fetch("/api/folders", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newFolderName.trim(), parentId: newFolderParentId }),
        });
        if (!res.ok) throw new Error(t("errors.createFolder"));
        const { folder } = await res.json();
        setCurrentSubfolders(prev => [...prev, folder]);
      }
      setNewFolderName("");
      setShowNewFolder(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("errors.unexpected"));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function createRootFolder() {
    if (!rootFormName.trim()) return;
    setCreatingRoot(true);
    try {
      const res = await fetch("/api/externos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: rootFormName.trim() }),
      });
      if (!res.ok) throw new Error(t("errors.createFolder"));
      const { folder } = await res.json();
      setRootFolders(prev => [...prev, folder]);
      setRootFormName("");
      setShowRootForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("errors.unexpected"));
    } finally {
      setCreatingRoot(false);
    }
  }

  function startRename(folder: ExternalFolder) {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  }

  async function saveRename(folderId: string) {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) return;
      setRootFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: trimmed } : f));
      setCurrentSubfolders(prev => prev.map(f => f.id === folderId ? { ...f, name: trimmed } : f));
      setNavStack(prev => prev.map(n => n.id === folderId ? { ...n, name: trimmed } : n));
    } catch { /* ignore */ }
  }

  async function deleteFolder(folderId: string, folderName: string) {
    if (!confirm(t("deleteFolderConfirm", { name: folderName }))) return;
    const res = await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
    if (!res.ok) return;
    const isRoot = rootFolders.some(f => f.id === folderId);
    if (isRoot) {
      const nextFolders = rootFolders.filter(f => f.id !== folderId);
      setRootFolders(nextFolders);
      if (navStack[0]?.id === folderId) navigateToRoot();
    } else {
      setCurrentSubfolders(prev => prev.filter(f => f.id !== folderId));
      const stackIdx = navStack.findIndex(n => n.id === folderId);
      if (stackIdx >= 0) {
        const newStack = navStack.slice(0, stackIdx);
        setNavStack(newStack);
        if (newStack.length > 0) fetchFolder(newStack[newStack.length - 1].id);
        else navigateToRoot();
      }
    }
  }

  // ── File actions ──────────────────────────────────────────────────────────────

  function openUpload() {
    setForm({ nombreDocumento: "", departamento: "", tipoDocumento: "PROCEDIMIENTO" });
    setPickedFile(null);
    setUploadError(null);
    setUploadProgress(0);
    setShowUpload(true);
  }

  async function handleUpload() {
    if (!pickedFile) { setUploadError(t("errors.noFile")); return; }
    if (!currentFolderId) { setUploadError(t("errors.noFolder")); return; }
    if (!form.nombreDocumento.trim()) { setUploadError(t("errors.noNombre")); return; }

    setUploading(true);
    setUploadError(null);

    try {
      const urlRes = await fetch("/api/files/upload-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: currentFolderId, name: pickedFile.name,
          mimeType: pickedFile.type || "application/octet-stream", size: pickedFile.size,
        }),
      });
      if (!urlRes.ok) {
        const e = await urlRes.json().catch(() => ({}));
        throw new Error(e.error ?? t("errors.uploadUrl"));
      }
      const { uploadUrl, storageKey } = await urlRes.json();

      setUploadProgress(30);
      const putRes = await fetch(uploadUrl, {
        method: "PUT", body: pickedFile,
        headers: { "Content-Type": pickedFile.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error(t("errors.uploadFile"));
      setUploadProgress(70);

      const createRes = await fetch("/api/crear-documento", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey, name: pickedFile.name,
          mimeType: pickedFile.type || "application/octet-stream",
          size: pickedFile.size,
          nombreDocumento: form.nombreDocumento.trim(),
          departamento: "Externo",
          tipoDocumento: "OTRO",
          versionStr: "v1.0",
          folderId: currentFolderId,
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
      fetchFolder(currentFolderId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("errors.unexpected"));
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(fileId: string, fileName: string) {
    if (!confirm(t("deleteConfirm", { name: fileName }))) return;
    await fetch(`/api/files/${fileId}`, { method: "DELETE" });
    setCurrentFiles(prev => prev.filter(f => f.id !== fileId));
  }

  function viewFile(file: ExternalFile) {
    if (isViewable(file.mimeType)) {
      setViewerFile({ id: file.id, name: file.nombreDocumento || file.name, mimeType: file.mimeType });
    } else {
      fetch(`/api/files/${file.id}/view-url`).then((r) => r.json()).then((d) => window.open(d.url, "_blank"));
    }
  }

  async function downloadFile(fileId: string) {
    const res = await fetch(`/api/files/${fileId}/download-url`);
    if (!res.ok) return;
    const { url } = await res.json();
    const a = document.createElement("a");
    a.href = url; a.download = ""; a.click();
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f8fafc", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>

      {/* ── Brand header ── */}
      <div style={{ background: brand, color: "#fff", padding: "12px 24px", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <Globe size={18} />
        <strong style={{ fontSize: 16 }}>{t("header")}</strong>
      </div>

      {/* ── Topbar: breadcrumb + actions ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 24px", height: 52, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>

        {/* Back button */}
        {currentFolderId && (
          <button onClick={navigateBack}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#374151", padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            <ChevronLeft size={15} /> Atrás
          </button>
        )}

        {/* Breadcrumb */}
        <nav style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, fontSize: 14, overflow: "hidden", minWidth: 0 }}>
          <span onClick={navigateToRoot}
            style={{ cursor: "pointer", color: brand, fontWeight: 600, whiteSpace: "nowrap" }}>
            Externos
          </span>
          {navStack.map((item, idx) => (
            <span key={item.id} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <span style={{ color: "#cbd5e1", margin: "0 2px" }}>/</span>
              <span
                onClick={() => idx < navStack.length - 1 ? navigateToCrumb(idx) : undefined}
                style={{
                  cursor: idx < navStack.length - 1 ? "pointer" : "default",
                  color: idx < navStack.length - 1 ? brand : "#1e293b",
                  fontWeight: idx === navStack.length - 1 ? 600 : 400,
                  whiteSpace: "nowrap",
                }}>
                {item.name}
              </span>
            </span>
          ))}
        </nav>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {/* Root level: create root folder */}
          {!currentFolderId && isAdmin && (
            <button onClick={() => { setShowRootForm(true); setRootFormName(""); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: brand, color: "#fff", border: "none", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              <Plus size={14} /> {t("createFolder")}
            </button>
          )}
          {/* Inside folder: create subfolder + upload */}
          {currentFolderId && isAdmin && (
            <button onClick={() => openNewFolder(currentFolderId)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              <FolderPlus size={14} /> {t("newSubfolder")}
            </button>
          )}
          {currentFolderId && canEdit && (
            <button onClick={openUpload}
              style={{ display: "flex", alignItems: "center", gap: 6, background: brand, color: "#fff", border: "none", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              <Upload size={14} /> {t("uploadBtn")}
            </button>
          )}
        </div>
      </div>

      {/* ── Main scrollable content ── */}
      <main style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>

        {/* ═══════════════════════════════ ROOT LEVEL ═══════════════════════════════ */}
        {!currentFolderId && (
          <>
            {/* Inline create root folder form */}
            {showRootForm && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input autoFocus value={rootFormName}
                  onChange={(e) => setRootFormName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createRootFolder(); if (e.key === "Escape") { setShowRootForm(false); } }}
                  placeholder={t("folderModal.namePlaceholder")}
                  style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }} />
                <button onClick={createRootFolder} disabled={creatingRoot || !rootFormName.trim()}
                  style={{ background: brand, color: "#fff", border: "none", padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: (!rootFormName.trim() || creatingRoot) ? 0.6 : 1 }}>
                  {creatingRoot ? t("folderModal.creating") : t("folderModal.create")}
                </button>
                <button onClick={() => setShowRootForm(false)}
                  style={{ border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                  {tc("cancel")}
                </button>
              </div>
            )}

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ height: 58, background: "#e2e8f0", borderRadius: 10, opacity: 1 - i * 0.2 }} />
                ))}
              </div>
            ) : rootFolders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 32px", color: "#94a3b8" }}>
                <Globe size={48} strokeWidth={1} color="#cbd5e1" style={{ marginBottom: 12 }} />
                <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: "#64748b" }}>
                  {isAdmin ? t("noFolderAdmin") : t("noFolderUser")}
                </p>
                {isAdmin && (
                  <button onClick={() => { setShowRootForm(true); setRootFormName(""); }}
                    style={{ marginTop: 14, background: brand, color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    {t("createFolder")}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rootFolders.map((f) => {
                  const isRenaming = renamingId === f.id;
                  return (
                    <div key={f.id}
                      style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "13px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      {isRenaming ? (
                        <div style={{ display: "flex", gap: 8, flex: 1 }}>
                          <input autoFocus value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveRename(f.id); if (e.key === "Escape") setRenamingId(null); }}
                            onBlur={() => saveRename(f.id)}
                            style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none" }} />
                          <button onClick={() => setRenamingId(null)}
                            style={{ border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>{tc("cancel")}</button>
                        </div>
                      ) : (
                        <>
                          <span onClick={() => selectRoot(f)}
                            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 600, color: "#1e293b", fontSize: 14, flex: 1, minWidth: 0 }}>
                            <Folder size={20} color={brand} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                          </span>
                          {isAdmin && (
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button onClick={(e) => { e.stopPropagation(); startRename(f); }} title={t("renameFolder")}
                                style={actionBtnStyle}><Pencil size={13} /></button>
                              <button onClick={(e) => { e.stopPropagation(); deleteFolder(f.id, f.name); }} title={tc("eliminar")}
                                style={{ ...actionBtnStyle, color: "#ef4444", borderColor: "#fecaca", background: "#fff5f5" }}><Trash2 size={13} /></button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════ INSIDE FOLDER ════════════════════════════ */}
        {currentFolderId && (
          <>
            {navLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", marginBottom: 20, fontSize: 13 }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                {tc("loading")}
              </div>
            ) : (
              <>
                {/* Subfolders */}
                {currentSubfolders.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                      {t("subfoldersLabel")}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {currentSubfolders.map((sub) => {
                        const isRenaming = renamingId === sub.id;
                        return (
                          <div key={sub.id}
                            style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                            {isRenaming ? (
                              <div style={{ display: "flex", gap: 8, flex: 1 }}>
                                <input autoFocus value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") saveRename(sub.id); if (e.key === "Escape") setRenamingId(null); }}
                                  onBlur={() => saveRename(sub.id)}
                                  style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none" }} />
                                <button onClick={() => setRenamingId(null)}
                                  style={{ border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>{tc("cancel")}</button>
                              </div>
                            ) : (
                              <>
                                <span onClick={() => navigateInto(sub)}
                                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 600, color: "#1e293b", fontSize: 14, flex: 1, minWidth: 0 }}>
                                  <Folder size={18} color={brand} style={{ flexShrink: 0 }} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</span>
                                </span>
                                {isAdmin && (
                                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                    <button onClick={() => startRename(sub)} title={t("renameFolder")} style={actionBtnStyle}><Pencil size={13} /></button>
                                    <button onClick={() => deleteFolder(sub.id, sub.name)} title={tc("eliminar")}
                                      style={{ ...actionBtnStyle, color: "#ef4444", borderColor: "#fecaca", background: "#fff5f5" }}><Trash2 size={13} /></button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Subfolder create form (modal triggers this below) */}

                {/* Files section */}
                {currentFiles.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 20px", color: "#aaa" }}>
                    <FileText size={36} strokeWidth={1} style={{ marginBottom: 12 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>{t("emptyFolder")}</p>
                    {canEdit && (
                      <button onClick={openUpload}
                        style={{ marginTop: 14, background: brand, color: "#fff", border: "none", padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                        {t("uploadFirst")}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {currentSubfolders.length > 0 && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                        {t("tableHeaders.documento")}s
                      </div>
                    )}
                    <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                          {[t("tableHeaders.documento"), tc("tipo"), tc("version"), t("tableHeaders.subidoPor"), t("tableHeaders.fecha"), ""].map((h, i) => (
                            <th key={i} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {currentFiles.map((f) => (
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
                                <button onClick={() => viewFile(f)} title={tc("ver")} style={actionBtnStyle}><Eye size={13} /></button>
                                <button onClick={() => downloadFile(f.id)} title={tc("descargar")} style={actionBtnStyle}><Download size={13} /></button>
                                {(isAdmin || f.uploadedBy?.id === currentUserId) && (
                                  <button onClick={() => deleteFile(f.id, f.nombreDocumento)} title={tc("eliminar")}
                                    style={{ ...actionBtnStyle, color: "#ef4444", borderColor: "#fecaca", background: "#fff5f5" }}><Trash2 size={13} /></button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* ── Upload modal ── */}
      {showUpload && (
        <div style={overlayStyle} onClick={() => !uploading && setShowUpload(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#1e293b" }}>{t("uploadModal.title")}</h3>
              {!uploading && <button onClick={() => setShowUpload(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>{t("uploadModal.folderLabel")}</label>
              <div style={{ ...inputStyle, background: "#f8fafc", color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>
                <Folder size={14} color={brand} />
                {navStack.map(n => n.name).join(" / ")}
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>{t("uploadModal.fileLabel")}</label>
              <div onClick={() => !uploading && fileInputRef.current?.click()}
                style={{ border: `2px dashed ${pickedFile ? brand : "#cbd5e1"}`, borderRadius: 8, padding: "14px 16px", cursor: uploading ? "default" : "pointer", textAlign: "center", background: pickedFile ? "#f0fdf4" : "#f8fafc" }}>
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

            <div style={fieldStyle}>
              <label style={labelStyle}>{t("uploadModal.nombreLabel")}</label>
              <input value={form.nombreDocumento} onChange={(e) => setForm(p => ({ ...p, nombreDocumento: e.target.value }))}
                placeholder={t("uploadModal.nombrePlaceholder")} style={inputStyle} disabled={uploading} />
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
              <button onClick={handleUpload} disabled={uploading}
                style={{ background: brand, color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, cursor: uploading ? "default" : "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: uploading ? 0.7 : 1 }}>
                {uploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />}
                {uploading ? t("uploadModal.uploading") : t("uploadModal.upload")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New subfolder modal ── */}
      {showNewFolder && (
        <div style={overlayStyle} onClick={() => setShowNewFolder(false)}>
          <div style={{ ...modalStyle, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{t("newSubfolder")}</h3>
              <button onClick={() => setShowNewFolder(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
            </div>
            {newFolderParentId && (
              <p style={{ margin: "0 0 14px", fontSize: 12, color: "#64748b", background: "#f8fafc", padding: "7px 10px", borderRadius: 6 }}>
                {t("newSubfolderIn", { parent: currentFolderName })}
              </p>
            )}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t("folderModal.nameLabel")}</label>
              <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createFolder()}
                placeholder={t("folderModal.namePlaceholder")} style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button onClick={() => setShowNewFolder(false)} style={{ border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>{tc("cancel")}</button>
              <button onClick={createFolder} disabled={creatingFolder || !newFolderName.trim()}
                style={{ background: brand, color: "#fff", border: "none", padding: "8px 18px", borderRadius: 8, cursor: creatingFolder ? "default" : "pointer", fontSize: 13, fontWeight: 600, opacity: (!newFolderName.trim() || creatingFolder) ? 0.6 : 1 }}>
                {creatingFolder ? t("folderModal.creating") : t("folderModal.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
    <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />
    </>
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
