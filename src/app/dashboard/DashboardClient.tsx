"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Search, LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight,
  LogOut, Files, Users, Shield, ClipboardList, ScrollText, Plus, Eye,
  Download, Pencil, Trash2, CheckCircle, Calendar, X, FolderOpen, ClipboardCheck, Inbox, Clock,
  History, FilePlus, BarChart2, UserCheck,
} from "lucide-react";
import FileIcon from "@/components/FileIcon";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FolderItem { id: string; name: string; createdAt: string; }

interface FileItem {
  id: string; name: string; mimeType: string; size: number; createdAt: string;
  reviewDueDate?: string | null; reviewIntervalDays?: number | null;
  assignedToId?: string | null; assignedToName?: string | null;
  status?: string | null; uploadedByUserId?: string | null;
  nombreDocumento?: string | null; codigo?: string | null;
}

interface Notification {
  id: string; type: string; message: string; read: boolean;
  createdAt: string; fileId: string | null;
}

interface UserOption { id: string; name: string; email: string; }
interface Crumb { id: string; name: string; }

interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string; logoUrl?: string | null };
  userRole: string;
  activeUserCount: number;
  maxUsers: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SPREADSHEET_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel", "text/csv", "application/csv",
]);
function isSpreadsheet(m: string) { return SPREADSHEET_TYPES.has(m); }

const WORD_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);
function isWord(m: string) { return WORD_TYPES.has(m); }
function isViewable(m: string) { return m === "application/pdf" || isSpreadsheet(m) || isWord(m); }

function dueDateColor(iso: string): string {
  const d = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  return d < 0 ? "#dc2626" : d <= 1 ? "#dc2626" : d <= 7 ? "#d97706" : "#16a34a";
}
function dueDateLabel(iso: string): string {
  const d = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  const fmt = (d: Date) => d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (d < 0) return `Overdue (${fmt(new Date(iso))})`;
  if (d < 1) return "Due today";
  if (d < 2) return "Due tomorrow";
  return `Due ${fmt(new Date(iso))}`;
}
function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardClient({ company, userRole, activeUserCount, maxUsers }: Props) {
  const router = useRouter();
  const brand = company.primaryColor;
  const accent = company.accentColor;
  const font = company.fontFamily;
  const canEdit = userRole === "COMPANY_ADMIN" || userRole === "EDITOR";
  const isAdmin = userRole === "COMPANY_ADMIN";

  // ── existing state ──────────────────────────────────────────────────────────
  const [folderId, setFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([]);
  const [subfolders, setSubfolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [previewRows, setPreviewRows] = useState<string[][] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pdfViewerFile, setPdfViewerFile] = useState<FileItem | null>(null);
  const [pdfViewerUrl,  setPdfViewerUrl]  = useState<string | null>(null);
  const [pdfLoading,    setPdfLoading]    = useState(false);

  const [reviewEditFile, setReviewEditFile] = useState<FileItem | null>(null);
  const [reviewDate, setReviewDate] = useState("");
  const [reviewInterval, setReviewInterval] = useState("");
  const [reviewAssignee, setReviewAssignee] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [companyUsers, setCompanyUsers] = useState<UserOption[]>([]);
  const [moveFolderId, setMoveFolderId] = useState<string>("");
  const [allFolders, setAllFolders] = useState<{ id: string; name: string }[]>([]);
  const [movingSave, setMovingSave] = useState(false);

  const [peerReviewFile,      setPeerReviewFile]      = useState<FileItem | null>(null);
  const [peerReviewAssignee,  setPeerReviewAssignee]  = useState("");
  const [peerReviewMessage,   setPeerReviewMessage]   = useState("");
  const [submittingPeerReview, setSubmittingPeerReview] = useState(false);
  const [peerReviewUsers,     setPeerReviewUsers]     = useState<UserOption[]>([]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  // ── Pendientes state ────────────────────────────────────────────────────────
  const [pendingCounts, setPendingCounts] = useState({ enRevision: 0, borrador: 0, revisados: 0, atrasadas: 0 });
  const [pendingTop5,   setPendingTop5]   = useState<{ id: string; type: string; dueDate: string | null; docName: string }[]>([]);
  const [myPendingCR,   setMyPendingCR]   = useState(0);

  const [officeViewerFile,    setOfficeViewerFile]    = useState<FileItem | null>(null);
  const [officeViewerSheets,  setOfficeViewerSheets]  = useState<{ name: string; html: string }[]>([]);
  const [officeViewerTab,     setOfficeViewerTab]     = useState(0);
  const [officeViewerLoading, setOfficeViewerLoading] = useState(false);
  const [officeDownloadUrl,   setOfficeDownloadUrl]   = useState<string | null>(null);

  const [approvalBanner, setApprovalBanner] = useState<string | null>(null);
  const [pendingCRCount, setPendingCRCount] = useState(0);

  // ── new UI state ────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  // ── data fetching ───────────────────────────────────────────────────────────

  const fetchContents = useCallback(async (id: string | null) => {
    setLoading(true);
    try {
      const res = await fetch(id ? `/api/folders/${id}` : "/api/folders");
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      if (id) {
        setSubfolders(data.subfolders ?? []);
        setFiles(data.files ?? []);
        setBreadcrumb(data.breadcrumb ?? []);
      } else {
        setSubfolders(data.folders ?? []);
        setFiles(data.files ?? []);
        setBreadcrumb([]);
      }
    } finally { setLoading(false); }
  }, []);

  const fetchNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }
  }, []);

  const fetchCRCount = useCallback(async () => {
    if (!isAdmin) return;
    const res = await fetch("/api/change-requests/counts");
    if (res.ok) { const d = await res.json(); setPendingCRCount(d.pending ?? 0); }
  }, [isAdmin]);

  const fetchPendingCounts = useCallback(async () => {
    const res = await fetch("/api/tasks/counts");
    if (res.ok) {
      const data = await res.json();
      setPendingCounts({
        enRevision: data.pendientes ?? 0,
        borrador:   0,
        revisados:  0,
        atrasadas:  data.atrasadas ?? 0,
      });
      setPendingTop5(data.top5 ?? []);
      setMyPendingCR(data.myPendingCR ?? 0);
    }
  }, []);

  useEffect(() => { fetchContents(folderId); }, [folderId, fetchContents]);
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  useEffect(() => { fetchPendingCounts(); }, [fetchPendingCounts]);
  useEffect(() => { fetchCRCount(); }, [fetchCRCount]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (reviewEditFile && isAdmin && companyUsers.length === 0) {
      fetch("/api/admin/users").then((r) => r.json()).then((d) => setCompanyUsers(d.users ?? []));
    }
  }, [reviewEditFile, isAdmin, companyUsers.length]);

  // ── actions (all unchanged) ─────────────────────────────────────────────────

  async function openNotifications() {
    setNotifOpen((o) => !o);
    if (!notifOpen && unreadCount > 0) {
      await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }

  function navigateTo(id: string | null) {
    setFolderId(id);
    setShowNewFolder(false);
    setRenamingId(null);
    setReviewEditFile(null);
    setSearchQuery("");
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    const res = await fetch("/api/folders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName.trim(), parentId: folderId ?? undefined }),
    });
    setCreatingFolder(false);
    if (res.ok) { setNewFolderName(""); setShowNewFolder(false); fetchContents(folderId); }
    else { const d = await res.json().catch(() => ({})); alert(d.error ?? "Failed to create folder"); }
  }

  async function saveRename(id: string) {
    if (!renameValue.trim()) return;
    const res = await fetch(`/api/folders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    if (res.ok) {
      setRenamingId(null);
      fetchContents(folderId);
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "No se pudo renombrar la carpeta");
    }
  }

  async function deleteFolder(id: string, name: string) {
    if (!confirm(`Move folder "${name}" to trash?`)) return;
    const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (res.ok) fetchContents(folderId);
    else alert("Failed to delete folder");
  }

  function openReviewPanel(file: FileItem) {
    setReviewEditFile(file);
    setReviewDate(file.reviewDueDate ? file.reviewDueDate.slice(0, 10) : "");
    setReviewInterval(file.reviewIntervalDays ? String(file.reviewIntervalDays) : "");
    setReviewAssignee(file.assignedToId ?? "");
    setMoveFolderId("");
    // Fetch flat list of folders if admin
    if (isAdmin && allFolders.length === 0) {
      fetch("/api/folders").then((r) => r.ok ? r.json() : null).then((d) => {
        if (d?.folders) setAllFolders(d.folders.map((f: FolderItem) => ({ id: f.id, name: f.name })));
      });
    }
  }

  async function moveFileToFolder() {
    if (!reviewEditFile || !moveFolderId) return;
    setMovingSave(true);
    const res = await fetch(`/api/files/${reviewEditFile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: moveFolderId }),
    });
    setMovingSave(false);
    if (res.ok) { setReviewEditFile(null); fetchContents(folderId); }
    else { const d = await res.json().catch(() => ({})); alert(d.error ?? "Error al mover"); }
  }

  async function saveReview() {
    if (!reviewEditFile) return;
    setSavingReview(true);
    const body: Record<string, unknown> = {
      reviewDueDate: reviewDate ? new Date(reviewDate).toISOString() : null,
      reviewIntervalDays: reviewInterval ? parseInt(reviewInterval) : null,
      assignedToId: reviewAssignee || null,
    };
    const res = await fetch(`/api/files/${reviewEditFile.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) { setReviewEditFile(null); fetchContents(folderId); }
    else { const d = await res.json().catch(() => ({})); alert(d.error ?? "Failed to save"); }
    setSavingReview(false);
  }

  async function completeReview(file: FileItem) {
    const res = await fetch(`/api/files/${file.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completeReview: true }),
    });
    if (res.ok) fetchContents(folderId);
    else alert("Failed to complete review");
  }

  async function openPeerReviewModal(file: FileItem) {
    setPeerReviewFile(file);
    setPeerReviewAssignee("");
    setPeerReviewMessage("");
    if (peerReviewUsers.length === 0) {
      const d = await fetch("/api/listado-maestro").then((r) => r.json()).catch(() => ({}));
      setPeerReviewUsers(d.users ?? []);
    }
  }

  async function submitPeerReview() {
    if (!peerReviewFile || !peerReviewAssignee) return;
    setSubmittingPeerReview(true);
    try {
      const res = await fetch("/api/peer-review-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: peerReviewFile.id, assigneeId: peerReviewAssignee, message: peerReviewMessage || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPeerReviewFile(null);
      } else {
        alert(data.error ?? "Error al enviar la solicitud");
      }
    } finally {
      setSubmittingPeerReview(false);
    }
  }

  async function openPreview(file: FileItem) {
    if (file.mimeType === "application/pdf") {
      setPdfViewerFile(file); setPdfViewerUrl(null); setPdfLoading(true);
      const r = await fetch(`/api/files/${file.id}/view-url`);
      if (r.ok) { const d = await r.json(); setPdfViewerUrl(d.url); }
      setPdfLoading(false);
      return;
    }
    // Excel / Word / other — office viewer modal
    setOfficeViewerFile(file);
    setOfficeViewerSheets([]);
    setOfficeViewerTab(0);
    setOfficeDownloadUrl(null);
    setOfficeViewerLoading(true);
    try {
      const dlRes = await fetch(`/api/files/${file.id}/download-url`);
      if (dlRes.ok) { const d = await dlRes.json(); setOfficeDownloadUrl(d.url); }
      if (isSpreadsheet(file.mimeType)) {
        const r = await fetch(`/api/files/${file.id}/excel-html`);
        if (r.ok) { const d = await r.json(); setOfficeViewerSheets(d.sheets ?? []); }
      } else if (isWord(file.mimeType)) {
        const r = await fetch(`/api/files/${file.id}/word-html`);
        if (r.ok) { const d = await r.json(); setOfficeViewerSheets([{ name: "Documento", html: d.html ?? "" }]); }
      }
    } finally {
      setOfficeViewerLoading(false);
    }
  }

  async function downloadFile(id: string) {
    const res = await fetch(`/api/files/${id}/download-url`);
    if (!res.ok) { alert("Could not get download link"); return; }
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  async function deleteFile(id: string, name: string) {
    if (!confirm(`Move "${name}" to trash?`)) return;
    const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 202 && data.requiresApproval) {
      setApprovalBanner("Tu solicitud de eliminación fue enviada al administrador para revisión.");
      setTimeout(() => setApprovalBanner(null), 7000);
      return;
    }
    if (res.ok) fetchContents(folderId);
    else alert("Failed to delete file");
  }

  // ── derived state ───────────────────────────────────────────────────────────

  const q = searchQuery.toLowerCase();
  const visibleFolders = q ? subfolders.filter((f) => f.name.toLowerCase().includes(q)) : subfolders;
  const visibleFiles   = q ? files.filter((f) =>
    f.name.toLowerCase().includes(q) ||
    (f.nombreDocumento?.toLowerCase().includes(q) ?? false) ||
    (f.codigo?.toLowerCase().includes(q) ?? false)
  ) : files;

  const pendingReviews = files.filter((f) => f.reviewDueDate && new Date(f.reviewDueDate).getTime() > Date.now() && (new Date(f.reviewDueDate).getTime() - Date.now()) / 86_400_000 <= 7).length;
  const overdueCount   = files.filter((f) => f.reviewDueDate && new Date(f.reviewDueDate).getTime() < Date.now()).length;

  // ── render ──────────────────────────────────────────────────────────────────

  const pendingTotal = pendingCounts.enRevision + pendingCounts.atrasadas;
  const hasAnyPending = pendingTotal > 0 || myPendingCR > 0 || (isAdmin && pendingCRCount > 0);

  const canCreate = userRole === "COMPANY_ADMIN" || userRole === "EDITOR";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minWidth: 0 }}>

      {/* ── CSS ────────────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
          background-size: 800px 100%;
          animation: shimmer 1.4s ease-in-out infinite;
          border-radius: 6px;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.18s ease-out; }
        .file-row { transition: background 0.1s ease; }
        .file-row:hover { background: #f8fafc !important; }
        .file-card { transition: box-shadow 0.15s ease, transform 0.15s ease; cursor: pointer; }
        .file-card:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.1) !important; transform: translateY(-2px); }
        .icon-btn { transition: background 0.12s ease, color 0.12s ease; }
        .icon-btn:hover { background: rgba(255,255,255,0.15) !important; }
        .action-btn { transition: opacity 0.12s ease, transform 0.1s ease; }
        .action-btn:hover { opacity: 0.88; }
        .ghost-btn { transition: background 0.12s ease, border-color 0.12s ease; }
        .ghost-btn:hover { background: #f1f5f9 !important; }
        .danger-btn { transition: background 0.12s ease; }
        .danger-btn:hover { background: #fee2e2 !important; }
        input:focus, select:focus, textarea:focus { outline: 2px solid ${brand}40; outline-offset: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

        {/* Top bar */}
        <header style={{
          height: 60, padding: "0 24px", background: "#fff",
          borderBottom: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", gap: 16, flexShrink: 0,
        }}>
          {/* Breadcrumb */}
          <nav style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, fontSize: 14, overflow: "hidden", minWidth: 0 }}>
            <span onClick={() => navigateTo(null)} style={{ cursor: "pointer", color: brand, fontWeight: 600, whiteSpace: "nowrap" }}>
              Home
            </span>
            {breadcrumb.map((crumb, i) => (
              <span key={crumb.id} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <span style={{ color: "#cbd5e1", margin: "0 2px" }}>/</span>
                <span
                  onClick={() => i < breadcrumb.length - 1 ? navigateTo(crumb.id) : undefined}
                  style={{
                    cursor: i < breadcrumb.length - 1 ? "pointer" : "default",
                    color: i < breadcrumb.length - 1 ? brand : "#1e293b",
                    fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}
                >
                  {crumb.name}
                </span>
              </span>
            ))}
          </nav>

          {/* Search */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files…"
              style={{
                paddingLeft: 32, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13,
                width: 200, background: "#f8fafc", color: "#1e293b",
              }}
            />
          </div>

          {/* View toggle */}
          <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}>
            {(["list", "grid"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  background: viewMode === m ? "#fff" : "transparent",
                  border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer",
                  color: viewMode === m ? brand : "#94a3b8",
                  boxShadow: viewMode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  display: "flex", alignItems: "center",
                  transition: "all 0.15s ease",
                }}
              >
                {m === "list" ? <ListIcon size={15} /> : <LayoutGrid size={15} />}
              </button>
            ))}
          </div>

          {/* Bell — pending count, navigates to /dashboard/pendientes */}
          <button
            onClick={() => router.push("/dashboard/pendientes")}
            className="icon-btn"
            title="Pendientes"
            style={{
              position: "relative", border: "1px solid #e2e8f0", background: "#fff",
              borderRadius: 8, padding: "7px 9px", cursor: "pointer", display: "flex", alignItems: "center",
              color: "#64748b", flexShrink: 0,
            }}
          >
            <Bell size={17} />
            {pendingTotal > 0 && (
              <span style={{
                position: "absolute", top: -5, right: -5,
                background: "#ef4444", color: "#fff", borderRadius: "50%",
                width: 17, height: 17, fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid #fff",
              }}>
                {pendingTotal > 9 ? "9+" : pendingTotal}
              </span>
            )}
          </button>
        </header>

        {/* ── Persistent Pendientes Banner ─────────────────────────────────────── */}
        {hasAnyPending && (
          <div style={{
            background: `linear-gradient(135deg, ${brand}f0 0%, ${brand} 100%)`,
            color: "#fff",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexShrink: 0,
            flexWrap: "wrap",
            boxShadow: `0 2px 8px ${brand}40`,
          }}>
            <Bell size={18} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Tienes pendientes que requieren tu atención</span>
              <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                {pendingCounts.enRevision > 0 && (
                  <span style={{ fontSize: 12, background: "rgba(255,255,255,0.22)", borderRadius: 6, padding: "2px 10px", fontWeight: 600 }}>
                    {pendingCounts.enRevision} tarea{pendingCounts.enRevision !== 1 ? "s" : ""} pendiente{pendingCounts.enRevision !== 1 ? "s" : ""}
                  </span>
                )}
                {pendingCounts.atrasadas > 0 && (
                  <span style={{ fontSize: 12, background: "#dc2626", borderRadius: 6, padding: "2px 10px", fontWeight: 700 }}>
                    ⚠ {pendingCounts.atrasadas} atrasada{pendingCounts.atrasadas !== 1 ? "s" : ""}
                  </span>
                )}
                {myPendingCR > 0 && (
                  <span style={{ fontSize: 12, background: "rgba(255,255,255,0.22)", borderRadius: 6, padding: "2px 10px", fontWeight: 600 }}>
                    {myPendingCR} solicitud{myPendingCR !== 1 ? "es" : ""} en revisión
                  </span>
                )}
                {isAdmin && pendingCRCount > 0 && (
                  <span style={{ fontSize: 12, background: "#f59e0b", color: "#1e293b", borderRadius: 6, padding: "2px 10px", fontWeight: 700 }}>
                    {pendingCRCount} solicitud{pendingCRCount !== 1 ? "es" : ""} por aprobar
                  </span>
                )}
              </div>
              {pendingTop5.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {pendingTop5.slice(0, 3).map((t) => (
                    <span key={t.id} style={{ fontSize: 11, background: "rgba(0,0,0,0.18)", borderRadius: 4, padding: "1px 8px", display: "flex", alignItems: "center", gap: 4, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.docName}</span>
                      {t.dueDate && <span style={{ opacity: 0.75, flexShrink: 0 }}>· {new Date(t.dueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" })}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => router.push("/dashboard/pendientes")}
              style={{ background: "#fff", color: brand, border: "none", padding: "8px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
            >
              Ver Pendientes →
            </button>
          </div>
        )}

        {/* Main scrollable content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px", background: "#f8fafc" }}>

          {/* ── Summary cards (root only) ── */}
          {!folderId && !loading && (
            <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
              {[
                { label: "Carpetas",             value: subfolders.length, color: brand,     icon: <FolderOpen size={20} /> },
                { label: "Archivos",             value: files.length,      color: accent,    icon: <Files size={20} /> },
                { label: "Revisiones pendientes", value: pendingReviews,    color: "#d97706", icon: <Calendar size={20} /> },
                { label: "Overdue",         value: overdueCount,      color: "#dc2626", icon: <CheckCircle size={20} /> },
              ].map(({ label, value, color, icon }) => (
                <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</p>
                      <p style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
                    </div>
                    <div style={{ color, opacity: 0.7, marginTop: 2 }}>{icon}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Approval banner ── */}
          {approvalBanner && (
            <div className="fade-up" style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <Clock size={15} color="#92400e" style={{ flexShrink: 0 }} />
              <span style={{ color: "#78350f", flex: 1 }}>{approvalBanner}</span>
              <button onClick={() => setApprovalBanner(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", padding: 0, display: "flex" }}><X size={15} /></button>
            </div>
          )}

          {/* ── Action bar ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canEdit && (
                <>
                  <button
                    onClick={() => { setShowNewFolder(!showNewFolder); setRenamingId(null); }}
                    className="action-btn"
                    style={{ display: "flex", alignItems: "center", gap: 6, background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
                  >
                    <Plus size={15} /> Nueva Carpeta
                  </button>
                  <button
                    onClick={() => router.push("/dashboard/crear-documento")}
                    className="action-btn"
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", color: brand, border: `1.5px solid ${brand}`, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
                  >
                    <Plus size={15} /> Crear Documento
                  </button>
                </>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {!loading && `${visibleFolders.length + visibleFiles.length} item${visibleFolders.length + visibleFiles.length !== 1 ? "s" : ""}${searchQuery ? " matching" : ""}`}
            </div>
          </div>

          {/* ── New folder form ── */}
          {showNewFolder && (
            <div className="fade-up" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                autoFocus placeholder="Folder name" value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); } }}
                style={inputStyle}
              />
              <button onClick={createFolder} disabled={creatingFolder} style={{ background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Crear</button>
              <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} style={cancelBtnStyle}>Cancel</button>
            </div>
          )}

          {/* ── Loading skeleton ── */}
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton" style={{ height: 58, width: "100%", borderRadius: 10, opacity: 1 - i * 0.12 }} />
              ))}
            </div>

          /* ── Empty state ── */
          ) : visibleFolders.length === 0 && visibleFiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "64px 32px", color: "#94a3b8" }}>
              {searchQuery ? (
                <>
                  <Search size={40} color="#cbd5e1" />
                  <p style={{ margin: "16px 0 6px", fontSize: 16, fontWeight: 600, color: "#64748b" }}>No results for "{searchQuery}"</p>
                  <p style={{ margin: 0, fontSize: 13 }}>Try a different search term.</p>
                </>
              ) : (
                <>
                  <FolderOpen size={48} color="#cbd5e1" />
                  <p style={{ margin: "16px 0 6px", fontSize: 16, fontWeight: 600, color: "#64748b" }}>This folder is empty</p>
                  {canEdit && <p style={{ margin: 0, fontSize: 13 }}>Crea una carpeta o usa <strong>Crear Documento</strong> para añadir archivos.</p>}
                </>
              )}
            </div>

          /* ── Contents ── */
          ) : viewMode === "list" ? (

            /* List view */
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

              {/* Folder rows */}
              {visibleFolders.map((f) => (
                <div key={f.id} className="file-row" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  {renamingId === f.id ? (
                    <div style={{ display: "flex", gap: 8, flex: 1 }}>
                      <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRename(f.id); if (e.key === "Escape") setRenamingId(null); }}
                        style={{ ...inputStyle, flex: 1 }} />
                      <button onClick={() => saveRename(f.id)} style={{ background: brand, color: "#fff", border: "none", padding: "6px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Save</button>
                      <button onClick={() => setRenamingId(null)} style={cancelBtnStyle}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <span onClick={() => navigateTo(f.id)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 600, color: "#1e293b", fontSize: 14, flex: 1, minWidth: 0 }}>
                        <FileIcon isFolder size={18} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      </span>
                      {canEdit && (
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button className="ghost-btn" onClick={() => { setRenamingId(f.id); setRenameValue(f.name); }} style={ghostBtnStyle} title="Rename"><Pencil size={13} /></button>
                          <button className="danger-btn" onClick={() => deleteFolder(f.id, f.name)} style={dangerBtnStyle} title="Trash"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {/* File rows */}
              {visibleFiles.map((f) => (
                <div key={f.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  <div className="file-row" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                      <FileIcon mimeType={f.mimeType} size={20} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nombreDocumento || f.name}</div>
                          {f.codigo && <span style={{ fontSize: 10, fontWeight: 700, background: "#e0f2fe", color: "#0369a1", borderRadius: 4, padding: "1px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>{f.codigo}</span>}
                          {f.status === "PENDING_APPROVAL" && (
                            <span style={{ fontSize: 10, fontWeight: 700, background: "#fef3c7", color: "#92400e", borderRadius: 4, padding: "1px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>
                              Pendiente de aprobación
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 2 }}>
                          {f.nombreDocumento && <span style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>}
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>{fmtSize(f.size)}</span>
                          {f.reviewDueDate && (
                            <span style={{ fontSize: 11, color: dueDateColor(f.reviewDueDate), fontWeight: 600 }}>
                              {dueDateLabel(f.reviewDueDate)}
                              {f.assignedToName && <span style={{ color: "#94a3b8", fontWeight: 400 }}> · {f.assignedToName}</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {isViewable(f.mimeType) && (
                        <button className="ghost-btn" onClick={() => openPreview(f)} style={ghostBtnStyle}>
                          <Eye size={13} /> Ver
                        </button>
                      )}
                      <button className="ghost-btn" onClick={() => downloadFile(f.id)} style={ghostBtnStyle} title="Descargar"><Download size={13} /></button>
                      {isAdmin && <button className="ghost-btn" onClick={() => openReviewPanel(f)} style={{ ...ghostBtnStyle, display: "flex", alignItems: "center", gap: 4 }} title="Programar revisión"><Calendar size={13} /></button>}
                      {isAdmin && f.reviewDueDate && (
                        <button className="ghost-btn" onClick={() => completeReview(f)} style={{ ...ghostBtnStyle, color: "#16a34a", borderColor: "#bbf7d0" }} title="Marcar revisión completa"><CheckCircle size={13} /></button>
                      )}
                      {!isAdmin && canEdit && (
                        <button className="ghost-btn" onClick={() => openPeerReviewModal(f)} style={{ ...ghostBtnStyle, display: "flex", alignItems: "center", gap: 4 }} title="Solicitar revisión a colega">
                          <UserCheck size={13} /> Solicitar
                        </button>
                      )}
                      {canEdit && <button className="danger-btn" onClick={() => deleteFile(f.id, f.nombreDocumento || f.name)} style={dangerBtnStyle} title="Trash"><Trash2 size={13} /></button>}
                    </div>
                  </div>

                  {/* Review inline panel */}
                  {reviewEditFile?.id === f.id && (
                    <div className="fade-up" style={{ borderTop: "1px solid #e2e8f0", padding: "16px 20px", background: "#f8fafc" }}>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div>
                          <label style={labelStyle}>Due date</label>
                          <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} style={{ ...inputStyle, width: 150 }} />
                        </div>
                        <div>
                          <label style={labelStyle}>Repeat every (days)</label>
                          <input type="number" min={1} max={3650} placeholder="e.g. 30" value={reviewInterval} onChange={(e) => setReviewInterval(e.target.value)} style={{ ...inputStyle, width: 120 }} />
                        </div>
                        {isAdmin && companyUsers.length > 0 && (
                          <div>
                            <label style={labelStyle}>Assign to</label>
                            <select value={reviewAssignee} onChange={(e) => setReviewAssignee(e.target.value)} style={{ ...inputStyle, width: 180 }}>
                              <option value="">Unassigned</option>
                              {companyUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          </div>
                        )}
                        {isAdmin && allFolders.length > 0 && (
                          <div>
                            <label style={labelStyle}>Mover a carpeta</label>
                            <div style={{ display: "flex", gap: 6 }}>
                              <select value={moveFolderId} onChange={(e) => setMoveFolderId(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                                <option value="">Sin cambio</option>
                                {allFolders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                              </select>
                              {moveFolderId && (
                                <button onClick={moveFileToFolder} disabled={movingSave} style={{ background: "#7c3aed", color: "#fff", border: "none", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                                  {movingSave ? "…" : "Mover"}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={saveReview} disabled={savingReview} style={{ background: brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                            {savingReview ? "…" : "Save"}
                          </button>
                          <button onClick={() => setReviewEditFile(null)} style={cancelBtnStyle}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

          ) : (

            /* Grid view */
            <div>
              {/* Folder grid */}
              {visibleFolders.length > 0 && (
                <>
                  <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>Carpetas</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
                    {visibleFolders.map((f) => {
                      const isRenaming = renamingId === f.id;
                      return (
                        <div key={f.id} className="file-card" onClick={isRenaming ? undefined : () => navigateTo(f.id)} style={{ background: "#fff", border: `1px solid ${isRenaming ? brand : "#e2e8f0"}`, borderRadius: 12, padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", position: "relative", minHeight: 120, cursor: isRenaming ? "default" : "pointer" }}>
                          <FileIcon isFolder size={36} />
                          {isRenaming ? (
                            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveRename(f.id); if (e.key === "Escape") setRenamingId(null); }}
                                style={{ width: "100%", padding: "5px 8px", border: `1px solid ${brand}`, borderRadius: 6, fontSize: 13, textAlign: "center", boxSizing: "border-box", outline: "none" }}
                              />
                              <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={() => saveRename(f.id)} style={{ background: brand, color: "#fff", border: "none", padding: "4px 10px", borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Guardar</button>
                                <button onClick={() => setRenamingId(null)} style={{ background: "#f1f5f9", color: "#64748b", border: "none", padding: "4px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12 }}>
                                  <X size={11} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", width: "100%", whiteSpace: "nowrap" }}>{f.name}</span>
                          )}
                          {canEdit && !isRenaming && (
                            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                              <button className="ghost-btn" onClick={() => { setRenamingId(f.id); setRenameValue(f.name); }} style={{ ...ghostBtnStyle, padding: "3px 5px" }}><Pencil size={11} /></button>
                              <button className="danger-btn" onClick={() => deleteFolder(f.id, f.name)} style={{ ...dangerBtnStyle, padding: "3px 5px" }}><Trash2 size={11} /></button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {/* File grid */}
              {visibleFiles.length > 0 && (
                <>
                  <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>Archivos</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                    {visibleFiles.map((f) => (
                      <div
                        key={f.id} className="file-card"
                        onMouseEnter={() => setHoveredItemId(f.id)}
                        onMouseLeave={() => setHoveredItemId(null)}
                        style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 14px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", position: "relative", minHeight: 140 }}
                      >
                        {f.reviewDueDate && (
                          <span style={{ position: "absolute", top: 8, left: 10, fontSize: 10, fontWeight: 700, color: dueDateColor(f.reviewDueDate), background: `${dueDateColor(f.reviewDueDate)}18`, padding: "1px 6px", borderRadius: 4 }}>
                            {dueDateLabel(f.reviewDueDate)}
                          </span>
                        )}
                        <div style={{ marginTop: f.reviewDueDate ? 12 : 0 }}>
                          <FileIcon mimeType={f.mimeType} size={36} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", width: "100%", whiteSpace: "nowrap" }}>{f.nombreDocumento || f.name}</span>
                        {f.codigo && <span style={{ fontSize: 10, fontWeight: 700, background: "#e0f2fe", color: "#0369a1", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{f.codigo}</span>}
                        {f.status === "PENDING_APPROVAL" && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "#fef3c7", color: "#92400e", borderRadius: 4, padding: "1px 7px", whiteSpace: "nowrap" }}>
                            Pendiente
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmtSize(f.size)}</span>
                        {/* Action overlay on hover */}
                        {hoveredItemId === f.id && (
                          <div className="fade-up" style={{ position: "absolute", bottom: 8, left: 8, right: 8, display: "flex", gap: 4, justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
                            {isViewable(f.mimeType) && <button className="ghost-btn" onClick={() => openPreview(f)} style={{ ...ghostBtnStyle, fontSize: 11, padding: "3px 7px" }}><Eye size={12} /> Ver</button>}
                            <button className="ghost-btn" onClick={() => downloadFile(f.id)} style={{ ...ghostBtnStyle, padding: "3px 6px" }}><Download size={12} /></button>
                            {canEdit && <button className="danger-btn" onClick={() => deleteFile(f.id, f.nombreDocumento || f.name)} style={{ ...dangerBtnStyle, padding: "3px 6px" }}><Trash2 size={12} /></button>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </main>

      {/* ── Spreadsheet preview modal ──────────────────────────────────────── */}
      {previewFile && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)" }}
          onClick={() => setPreviewFile(null)}
        >
          <div className="fade-up" style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto", minWidth: 400, boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8, color: "#1e293b" }}>
                <FileIcon mimeType={previewFile.mimeType} size={18} />
                {previewFile.name}
              </h3>
              <button onClick={() => setPreviewFile(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                <X size={16} />
              </button>
            </div>
            {previewLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 36 }} />)}
              </div>
            ) : !previewRows || previewRows.length === 0 ? (
              <p style={{ color: "#94a3b8", textAlign: "center", padding: "32px 0" }}>No preview available.</p>
            ) : (
              <>
                <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {previewRows[0].map((cell, ci) => (
                          <th key={ci} style={{ padding: "8px 14px", textAlign: "left", borderBottom: "2px solid #e2e8f0", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>
                            {cell || `Column ${ci + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(1).map((row, ri) => (
                        <tr key={ri} style={{ borderBottom: "1px solid #f3f4f6", background: ri % 2 === 1 ? "#fafafa" : "#fff" }}>
                          {previewRows[0].map((_, ci) => (
                            <td key={ci} style={{ padding: "7px 14px", color: "#374151" }}>{row[ci] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewRows.length >= 10 && <p style={{ marginTop: 10, fontSize: 12, color: "#94a3b8", textAlign: "right" }}>Showing first {previewRows.length} rows</p>}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Excel / Word viewer modal ────────────────────────────────────────── */}
      {officeViewerFile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", flexDirection: "column", fontFamily: `'${font}', Inter, system-ui, sans-serif` }}>
          {/* Header */}
          <div style={{ background: "#1e293b", color: "#fff", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <FileIcon mimeType={officeViewerFile.mimeType} size={16} />
              <span style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {officeViewerFile.nombreDocumento || officeViewerFile.name}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
              {officeDownloadUrl && (
                <button
                  onClick={() => window.open(officeDownloadUrl, "_blank")}
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
                >
                  <Download size={13} /> Descargar
                </button>
              )}
              <button
                onClick={() => { setOfficeViewerFile(null); setOfficeViewerSheets([]); setOfficeDownloadUrl(null); }}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "5px 10px", borderRadius: 6, cursor: "pointer", display: "flex" }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Sheet tabs (Excel only, hidden for Word) */}
          {officeViewerSheets.length > 1 && !isWord(officeViewerFile.mimeType) && (
            <div style={{ background: "#0f172a", display: "flex", gap: 2, padding: "0 20px", flexShrink: 0 }}>
              {officeViewerSheets.map((s, i) => (
                <button key={i} onClick={() => setOfficeViewerTab(i)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: officeViewerTab === i ? 700 : 400, background: officeViewerTab === i ? "#fff" : "transparent", color: officeViewerTab === i ? "#1e293b" : "rgba(255,255,255,0.6)", border: "none", borderRadius: "6px 6px 0 0", cursor: "pointer" }}>
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div style={{ flex: 1, overflow: "auto", background: "#f8fafc" }}>
            {officeViewerLoading ? (
              <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#475569", fontSize: 14 }}>
                Cargando documento…
              </div>
            ) : officeViewerSheets.length > 0 ? (
              <div style={{ padding: isWord(officeViewerFile.mimeType) ? "32px 60px" : "16px 20px", maxWidth: isWord(officeViewerFile.mimeType) ? 860 : undefined, margin: "0 auto", background: "#fff", minHeight: "100%" }}>
                <style>{`
                  .xlsx-view table { border-collapse: collapse; font-size: 12.5px; white-space: nowrap; }
                  .xlsx-view td, .xlsx-view th { border: 1px solid #d1d5db; padding: 5px 12px; }
                  .xlsx-view tr:first-child td, .xlsx-view tr:first-child th { background: #f1f5f9; font-weight: 700; }
                  .xlsx-view tr:nth-child(even) td { background: #f8fafc; }
                  .word-view { font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.8; color: #1e293b; }
                  .word-view h1 { font-size: 22px; font-weight: 700; margin: 0 0 16px; }
                  .word-view h2 { font-size: 17px; font-weight: 700; margin: 20px 0 8px; }
                  .word-view h3 { font-size: 15px; font-weight: 600; margin: 16px 0 6px; }
                  .word-view p  { margin: 0 0 10px; }
                  .word-view table { border-collapse: collapse; width: 100%; margin: 12px 0; }
                  .word-view td, .word-view th { border: 1px solid #d1d5db; padding: 6px 10px; }
                  .word-view ul, .word-view ol { margin: 0 0 10px; padding-left: 24px; }
                `}</style>
                <div
                  className={isWord(officeViewerFile.mimeType) ? "word-view" : "xlsx-view"}
                  dangerouslySetInnerHTML={{ __html: officeViewerSheets[officeViewerTab]?.html ?? "" }}
                />
              </div>
            ) : (
              <div style={{ padding: "60px 40px", textAlign: "center", color: "#475569" }}>
                <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 16, color: "#1e293b" }}>No se puede previsualizar</p>
                <p style={{ margin: "0 0 24px", fontSize: 13 }}>Descarga el archivo para verlo.</p>
                {officeDownloadUrl && (
                  <button onClick={() => window.open(officeDownloadUrl, "_blank")} style={{ background: brand, color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                    Descargar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PDF viewer modal ─────────────────────────────────────────────────── */}
      {pdfViewerFile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#1e293b", color: "#fff", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{pdfViewerFile.name}</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={() => downloadFile(pdfViewerFile.id)}
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
              >
                <Download size={13} style={{ marginRight: 4 }} />Descargar
              </button>
              <button
                onClick={() => { setPdfViewerFile(null); setPdfViewerUrl(null); }}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "5px 10px", borderRadius: 6, cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {pdfLoading ? (
              <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#fff" }}>Cargando PDF…</div>
            ) : pdfViewerUrl ? (
              <iframe
                src={pdfViewerUrl}
                style={{ width: "100%", height: "100%", border: "none" }}
                title={pdfViewerFile.name}
              />
            ) : (
              <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#94a3b8" }}>No se pudo cargar el PDF.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Peer review request modal ─────────────────────────────────────── */}
      {peerReviewFile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "grid", placeItems: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 440, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <UserCheck size={18} color={brand} />
                <span style={{ fontWeight: 700, fontSize: 16, color: "#1e293b" }}>Solicitar revisión</span>
              </div>
              <button onClick={() => setPeerReviewFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
            </div>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "#64748b" }}>
              Documento: <strong style={{ color: "#1e293b" }}>{peerReviewFile.nombreDocumento || peerReviewFile.name}</strong>
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Asignar a</label>
              <select
                value={peerReviewAssignee}
                onChange={(e) => setPeerReviewAssignee(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
              >
                <option value="">Selecciona un colega…</option>
                {peerReviewUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Mensaje (opcional)</label>
              <textarea
                value={peerReviewMessage}
                onChange={(e) => setPeerReviewMessage(e.target.value)}
                placeholder="¿Qué debe revisar tu colega?"
                rows={3}
                style={{ ...inputStyle, width: "100%", resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setPeerReviewFile(null)} style={cancelBtnStyle}>Cancelar</button>
              <button
                onClick={submitPeerReview}
                disabled={!peerReviewAssignee || submittingPeerReview}
                style={{ background: brand, color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: peerReviewAssignee ? "pointer" : "not-allowed", fontWeight: 600, fontSize: 13, opacity: !peerReviewAssignee ? 0.5 : 1 }}
              >
                {submittingPeerReview ? "Enviando…" : "Solicitar revisión"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Style constants ───────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8",
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8,
  fontSize: 13, outline: "none", boxSizing: "border-box",
};

const cancelBtnStyle: React.CSSProperties = {
  background: "#f1f5f9", color: "#64748b", border: "none",
  padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500,
};

const ghostBtnStyle: React.CSSProperties = {
  background: "transparent", color: "#64748b", border: "1px solid #e2e8f0",
  padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
  display: "flex", alignItems: "center", gap: 4, fontWeight: 500,
};

const dangerBtnStyle: React.CSSProperties = {
  background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
  padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12,
  display: "flex", alignItems: "center", fontWeight: 600,
};
