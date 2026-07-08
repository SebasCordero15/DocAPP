"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ClipboardList, X } from "lucide-react";
import FileIcon from "@/components/FileIcon";

// ─── Types ─────────────────────────────────────────────────────────────────────

type MainTab = "acciones" | "seguimiento" | "equipo";
type DocTab  = "en_revision" | "atrasadas";

type TaskType   = "REVIEW" | "UPDATE" | "APPROVE" | "OTHER";
type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

interface TaskFile {
  id: string; name: string; nombreDocumento: string | null;
  codigo: string | null; versionStr: string | null; mimeType: string;
  status: string; folder: { id: string; name: string } | null;
}
interface TaskUser { id: string; name: string; email: string; }
interface OutgoingTaskInfo {
  id: string;
  type: "ACTUALIZACION" | "REVISION" | "CORRECCION";
  status: string;
  instructions: string | null;
  correctionFields: { nombre?: boolean; contenido?: boolean; area?: boolean; carpeta?: boolean; otro?: string | null } | null;
  currentStep: number;
  totalSteps: number;
  step1OutcomeType: string | null;
  step1StorageKey: string | null;
  step1VersionStr: string | null;
}

interface Task {
  id: string; type: TaskType; status: TaskStatus;
  dueDate: string | null; notes: string | null; rejectionNote: string | null;
  createdAt: string; completedAt: string | null; isOverdue: boolean;
  file: TaskFile; assignedTo: TaskUser; assignedBy: TaskUser;
  reviewChainId: string | null;
  stepOrder: number | null;
  chainCurrentStep: number | null;
  chainTotalSteps: number | null;
  outgoingRequestId: string | null;
  outgoingRequest: OutgoingTaskInfo | null;
}

interface DocFile {
  id: string; name: string; codigo: string | null; nombreDocumento: string | null;
  versionStr: string | null; fechaRevision: string | null; fechaEmision: string | null;
  status: "DRAFT" | "IN_REVIEW" | "REVIEWED"; mimeType: string;
  isOverdue: boolean;
  encargadoDocumento: { id: string; name: string; email: string } | null;
  folder: { id: string; name: string } | null;
}

interface DocCounts { enRevision: number; borrador: number; revisados: number; atrasadas: number; }

interface CompanyUser { id: string; name: string; email: string; role: string; }

interface AssignForm {
  fileId: string; docName: string;
  assignedToUserId: string; type: TaskType;
  dueDate: string; notes: string;
  autoApproveOnCompletion: boolean;
}

interface ChangeRequest {
  id: string;
  type: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt: string | null;
  adminNotes: string | null;
  file: { id: string; name: string; nombreDocumento: string | null; codigo: string | null } | null;
}

interface RejectedCR {
  id: string;
  type: string;
  createdAt: string;
  reviewedAt: string | null;
  adminNotes: string | null;
  file: { id: string; name: string; nombreDocumento: string | null; codigo: string | null; mimeType: string } | null;
  reviewedBy: { id: string; name: string } | null;
}

interface RejectedChain {
  id: string;
  rejectionNote: string | null;
  updatedAt: string;
  file: { id: string; name: string; nombreDocumento: string | null; codigo: string | null; mimeType: string; status: string } | null;
  rejectingStep: { stepOrder: number; rejectionNote: string | null; assignedTo: { id: string; name: string } } | null;
}

interface RejectedOutgoing {
  id: string;
  type: "ACTUALIZACION" | "REVISION" | "CORRECCION";
  finalNotes: string | null;
  finalReviewedAt: string | null;
  file: { id: string; name: string; nombreDocumento: string | null; codigo: string | null; mimeType: string } | null;
  finalReviewer: { id: string; name: string } | null;
}

interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string; logoUrl: string | null };
  userRole: string;
  userId: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  REVIEW: "Revisión", UPDATE: "Actualización", APPROVE: "Aprobación", OTHER: "Otra",
};
const TASK_TYPE_COLORS: Record<TaskType, { bg: string; color: string }> = {
  REVIEW:  { bg: "#dbeafe", color: "#1e40af" },
  UPDATE:  { bg: "#fef3c7", color: "#92400e" },
  APPROVE: { bg: "#dcfce7", color: "#166534" },
  OTHER:   { bg: "#f3f4f6", color: "#374151" },
};
const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: "Pendiente", IN_PROGRESS: "En Progreso", COMPLETED: "Completado",
};
const DOC_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador", IN_REVIEW: "En Revisión", REVIEWED: "Revisado",
};
const DOC_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  DRAFT:     { bg: "#fef3c7", color: "#92400e" },
  IN_REVIEW: { bg: "#dbeafe", color: "#1e40af" },
  REVIEWED:  { bg: "#dcfce7", color: "#166534" },
};

const CR_TYPE_LABELS: Record<string, string> = {
  NEW_UPLOAD:            "Subida nueva",
  EDIT_METADATA:         "Edición de metadatos",
  REPLACE_FILE:          "Reemplazo de archivo",
  DELETE:                "Eliminación",
  REVISION_DATE_CHANGE:  "Cambio de fecha de revisión",
  OTHER:                 "Otro",
};
const CR_STATUS_LABELS: Record<string, string> = {
  PENDING:  "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};
const CR_STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  PENDING:  { bg: "#fef3c7", color: "#92400e",  border: "#fcd34d" },
  APPROVED: { bg: "#dcfce7", color: "#166534",  border: "#86efac" },
  REJECTED: { bg: "#fee2e2", color: "#dc2626",  border: "#fca5a5" },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function PendientesClient({ company, userRole, userId }: Props) {
  const router = useRouter();
  const p = company.primaryColor;
  const isAdmin = userRole === "COMPANY_ADMIN";

  // ── tab state
  const [mainTab, setMainTab] = useState<MainTab>("acciones");
  const [docTab,  setDocTab]  = useState<DocTab>("en_revision");

  // ── task data
  const [myTasks,    setMyTasks]    = useState<Task[]>([]);
  const [teamTasks,  setTeamTasks]  = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // ── doc status data
  const [docFiles,   setDocFiles]   = useState<DocFile[]>([]);
  const [docCounts,  setDocCounts]  = useState<DocCounts>({ enRevision: 0, borrador: 0, revisados: 0, atrasadas: 0 });
  const [loadingDocs, setLoadingDocs] = useState(true);

  // ── team filter
  const [filterUser,   setFilterUser]   = useState("");
  const [filterType,   setFilterType]   = useState("");

  // ── opening / previewing a document
  const [openingDoc, setOpeningDoc] = useState<string | null>(null);

  const SPREADSHEET_TYPES = new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel", "text/csv", "application/csv",
  ]);
  const WORD_TYPES = new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ]);
  function isSpreadsheet(m: string) { return SPREADSHEET_TYPES.has(m); }
  function isWord(m: string) { return WORD_TYPES.has(m); }
  function isViewable(m: string) { return m === "application/pdf" || isSpreadsheet(m) || isWord(m); }

  async function openDoc(fileId: string) {
    setOpeningDoc(fileId);
    try {
      const res = await fetch(`/api/files/${fileId}/download-url`);
      if (!res.ok) { alert("No se pudo obtener el enlace del documento"); return; }
      const { url } = await res.json();
      window.open(url, "_blank");
    } finally {
      setOpeningDoc(null);
    }
  }

  async function openPreview(file: { id: string; name: string; mimeType: string }) {
    if (file.mimeType === "application/pdf") {
      setPdfViewerFile({ id: file.id, name: file.name });
      setPdfViewerUrl(null); setPdfLoading(true);
      const res = await fetch(`/api/files/${file.id}/view-url`);
      if (res.ok) { const { url } = await res.json(); setPdfViewerUrl(url); }
      setPdfLoading(false);
    } else if (isSpreadsheet(file.mimeType) || isWord(file.mimeType)) {
      setOfficeViewerFile({ id: file.id, name: file.name, mimeType: file.mimeType });
      setOfficeViewerSheets([]); setOfficeViewerTab(0); setOfficeViewerLoading(true); setOfficeDownloadUrl(null);
      const endpoint = isWord(file.mimeType) ? "word-html" : "excel-html";
      const [contentRes, dlRes] = await Promise.all([
        fetch(`/api/files/${file.id}/${endpoint}`),
        fetch(`/api/files/${file.id}/download-url`),
      ]);
      if (contentRes.ok) {
        const data = await contentRes.json();
        setOfficeViewerSheets(isWord(file.mimeType) ? [{ name: "Documento", html: data.html ?? "" }] : (data.sheets ?? []));
      }
      if (dlRes.ok) { const { url } = await dlRes.json(); setOfficeDownloadUrl(url); }
      setOfficeViewerLoading(false);
    } else {
      openDoc(file.id);
    }
  }

  // ── completing a task
  const [completing, setCompleting] = useState<string | null>(null);

  // ── review chain actions (approve / return / reject)
  const [chainModal, setChainModal] = useState<{
    taskId: string;
    action: "APPROVE" | "RETURN_TO_PREVIOUS" | "REJECT";
    docName: string;
    stepOrder: number;
  } | null>(null);
  const [chainNotes, setChainNotes] = useState("");
  const [chainWorking, setChainWorking] = useState(false);
  const [chainError, setChainError] = useState("");

  // ── outgoing request submit modal
  const [outModal, setOutModal] = useState<{
    taskId: string;
    outgoingRequest: OutgoingTaskInfo;
    docName: string;
    currentVersion: string | null;
  } | null>(null);
  const [outOutcome, setOutOutcome] = useState<"no_changes" | "new_version" | "corrected">("no_changes");
  const [outFile, setOutFile] = useState<File | null>(null);
  const [outVersionStr, setOutVersionStr] = useState("");
  const [outNombreDoc, setOutNombreDoc] = useState("");
  const [outDepartamento, setOutDepartamento] = useState("");
  const [outSubmitting, setOutSubmitting] = useState(false);
  const [outError, setOutError] = useState("");

  function openOutModal(task: Task) {
    if (!task.outgoingRequest) return;
    const or = task.outgoingRequest;
    const docName = task.file.nombreDocumento || task.file.name;
    // Pre-select sensible default outcome
    const defaultOutcome: "no_changes" | "new_version" | "corrected" =
      or.type === "ACTUALIZACION" ? "new_version"
      : or.type === "REVISION" ? "no_changes"
      : "corrected";
    setOutModal({ taskId: task.id, outgoingRequest: or, docName, currentVersion: task.file.versionStr });
    setOutOutcome(defaultOutcome);
    setOutFile(null); setOutVersionStr(""); setOutNombreDoc(""); setOutDepartamento("");
    setOutError("");
  }

  async function submitOutModal() {
    if (!outModal) return;
    const { outgoingRequest: or } = outModal;
    setOutSubmitting(true); setOutError("");

    let storageKey: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    let size: number | null = null;

    const needsUpload =
      (outOutcome === "new_version") ||
      (outOutcome === "corrected" && or.correctionFields?.contenido);

    if (needsUpload && outFile) {
      // 1. Get presigned URL
      const urlRes = await fetch(`/api/outgoing-requests/${or.id}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: outFile.name, mimeType: outFile.type, size: outFile.size }),
      });
      if (!urlRes.ok) {
        const d = await urlRes.json().catch(() => ({}));
        setOutError(d.error ?? "Error al obtener URL de subida"); setOutSubmitting(false); return;
      }
      const { uploadUrl, storageKey: sk } = await urlRes.json();
      // 2. Upload file
      const upRes = await fetch(uploadUrl, { method: "PUT", body: outFile, headers: { "Content-Type": outFile.type } });
      if (!upRes.ok) { setOutError("Error al subir el archivo"); setOutSubmitting(false); return; }
      storageKey = sk; fileName = outFile.name; mimeType = outFile.type; size = outFile.size;
    } else if (needsUpload && !outFile) {
      setOutError("Se requiere un archivo"); setOutSubmitting(false); return;
    }

    const metadata: Record<string, string> = {};
    if (outNombreDoc.trim()) metadata.nombreDocumento = outNombreDoc.trim();
    if (outDepartamento.trim()) metadata.departamento = outDepartamento.trim();

    const res = await fetch(`/api/outgoing-requests/${or.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcomeType: outOutcome,
        storageKey, fileName, mimeType, size,
        versionStr: outVersionStr.trim() || null,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      }),
    });
    setOutSubmitting(false);
    if (res.ok) {
      setOutModal(null);
      await fetchMyTasks();
    } else {
      const d = await res.json().catch(() => ({}));
      setOutError(d.error ?? "Error al enviar la respuesta");
    }
  }

  // ── change requests (Mis Solicitudes)
  const [myChangeRequests, setMyChangeRequests] = useState<ChangeRequest[]>([]);
  const [loadingCR, setLoadingCR] = useState(true);

  // ── rechazados / devueltos
  const [rejectedCRs,      setRejectedCRs]      = useState<RejectedCR[]>([]);
  const [rejectedChains,   setRejectedChains]   = useState<RejectedChain[]>([]);
  const [rejectedOutgoing, setRejectedOutgoing] = useState<RejectedOutgoing[]>([]);
  const [loadingRejected, setLoadingRejected] = useState(true);

  // ── document inline viewer (Point 5)
  const [pdfViewerFile,     setPdfViewerFile]     = useState<{ id: string; name: string } | null>(null);
  const [pdfViewerUrl,      setPdfViewerUrl]      = useState<string | null>(null);
  const [pdfLoading,        setPdfLoading]        = useState(false);
  const [officeViewerFile,  setOfficeViewerFile]  = useState<{ id: string; name: string; mimeType: string } | null>(null);
  const [officeViewerSheets, setOfficeViewerSheets] = useState<{ name: string; html: string }[]>([]);
  const [officeViewerTab,   setOfficeViewerTab]   = useState(0);
  const [officeViewerLoading, setOfficeViewerLoading] = useState(false);
  const [officeDownloadUrl, setOfficeDownloadUrl] = useState<string | null>(null);

  // ── assign modal
  const [showAssign,   setShowAssign]   = useState(false);
  const [assignForm,   setAssignForm]   = useState<AssignForm>({ fileId: "", docName: "", assignedToUserId: "", type: "REVIEW", dueDate: "", notes: "", autoApproveOnCompletion: false });
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [submittingAssign, setSubmittingAssign] = useState(false);
  const [assignError, setAssignError] = useState("");

  // ── fetch helpers
  const fetchMyTasks = useCallback(async () => {
    setLoadingTasks(true);
    const r = await fetch("/api/tasks?view=mine");
    if (r.ok) setMyTasks((await r.json()).tasks);
    setLoadingTasks(false);
  }, []);

  const fetchTeamTasks = useCallback(async () => {
    const params = new URLSearchParams({ view: "team" });
    if (filterUser) params.set("assignedToUserId", filterUser);
    if (filterType) params.set("type", filterType);
    const r = await fetch(`/api/tasks?${params}`);
    if (r.ok) setTeamTasks((await r.json()).tasks);
  }, [filterUser, filterType]);

  const fetchDocCounts = useCallback(async () => {
    const r = await fetch("/api/pendientes/counts");
    if (r.ok) setDocCounts(await r.json());
  }, []);

  const fetchDocFiles = useCallback(async (tab: DocTab) => {
    setLoadingDocs(true);
    const r = await fetch(`/api/pendientes?tab=${tab}`);
    if (r.ok) setDocFiles((await r.json()).files);
    setLoadingDocs(false);
  }, []);

  const fetchCompanyUsers = useCallback(async () => {
    if (companyUsers.length > 0) return;
    const r = await fetch("/api/admin/users");
    if (r.ok) setCompanyUsers((await r.json()).users ?? []);
  }, [companyUsers.length]);

  const fetchMyChangeRequests = useCallback(async () => {
    setLoadingCR(true);
    const r = await fetch("/api/change-requests?view=mine");
    if (r.ok) setMyChangeRequests((await r.json()).changeRequests ?? []);
    setLoadingCR(false);
  }, []);

  const fetchRejectedItems = useCallback(async () => {
    setLoadingRejected(true);
    const r = await fetch("/api/pendientes/rejected");
    if (r.ok) {
      const d = await r.json();
      setRejectedCRs(d.rejectedCRs ?? []);
      setRejectedChains(d.rejectedChains ?? []);
      setRejectedOutgoing(d.rejectedOutgoing ?? []);
    }
    setLoadingRejected(false);
  }, []);

  useEffect(() => { fetchMyTasks(); fetchDocCounts(); fetchDocFiles(docTab); fetchMyChangeRequests(); fetchRejectedItems(); }, []);
  useEffect(() => { if (isAdmin && mainTab === "equipo") { fetchTeamTasks(); fetchCompanyUsers(); } }, [mainTab, filterUser, filterType]);
  useEffect(() => { if (mainTab === "seguimiento") fetchDocFiles(docTab); }, [docTab, mainTab]);

  // ── complete a task
  const completeTask = async (taskId: string) => {
    setCompleting(taskId);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    await Promise.all([fetchMyTasks(), fetchDocCounts(), fetchDocFiles(docTab), fetchMyChangeRequests(), fetchRejectedItems()]);
    if (isAdmin && mainTab === "equipo") await fetchTeamTasks();
    setCompleting(null);
  };

  // ── review chain: approve / return to previous / reject
  const submitChainAction = async () => {
    if (!chainModal) return;
    const needsNote = chainModal.action === "RETURN_TO_PREVIOUS" || chainModal.action === "REJECT";
    if (needsNote && !chainNotes.trim()) { setChainError("Se requiere una nota"); return; }
    setChainWorking(true); setChainError("");
    const res = await fetch(`/api/review-chain/${chainModal.taskId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: chainModal.action, notes: chainNotes.trim() || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setChainError(d.error ?? "Error al procesar la acción");
      setChainWorking(false);
      return;
    }
    setChainModal(null); setChainNotes("");
    setChainWorking(false);
    await Promise.all([fetchMyTasks(), fetchDocCounts(), fetchDocFiles(docTab), fetchMyChangeRequests(), fetchRejectedItems()]);
    if (isAdmin && mainTab === "equipo") await fetchTeamTasks();
  };

  // ── assign a task
  const openAssignModal = (fileId: string, docName: string) => {
    setAssignForm({ fileId, docName, assignedToUserId: "", type: "REVIEW", dueDate: "", notes: "", autoApproveOnCompletion: false });
    setAssignError("");
    setShowAssign(true);
    fetchCompanyUsers();
  };

  const submitAssign = async () => {
    if (!assignForm.assignedToUserId) { setAssignError("Selecciona un usuario"); return; }
    setSubmittingAssign(true);
    setAssignError("");
    const body: Record<string, unknown> = {
      fileId: assignForm.fileId,
      assignedToUserId: assignForm.assignedToUserId,
      type: assignForm.type,
    };
    if (assignForm.dueDate) body.dueDate = new Date(assignForm.dueDate).toISOString();
    if (assignForm.notes.trim()) body.notes = assignForm.notes.trim();
    body.autoApproveOnCompletion = assignForm.autoApproveOnCompletion;

    const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmittingAssign(false);
    if (r.ok) {
      setShowAssign(false);
      await Promise.all([fetchMyTasks(), fetchTeamTasks(), fetchDocCounts(), fetchDocFiles(docTab)]);
    } else {
      const d = await r.json().catch(() => ({}));
      setAssignError(d.error ?? "Error al asignar");
    }
  };

  // ── change doc status
  const changeDocStatus = async (fileId: string, status: string) => {
    await fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await Promise.all([fetchDocCounts(), fetchDocFiles(docTab)]);
  };

  // ─── Rendered sections ──────────────────────────────────────────────────────

  const docTabs = [
    { key: "en_revision" as DocTab, label: "En Revisión",         count: docCounts.enRevision, color: p },
    { key: "atrasadas"   as DocTab, label: "Revisiones Atrasadas", count: docCounts.atrasadas,  color: "#dc2626" },
  ];

  const tasksToShow = mainTab === "equipo" ? teamTasks : myTasks;
  const loadingTasksNow = loadingTasks && mainTab === "acciones";
  const rejectedCount = rejectedCRs.length + rejectedChains.length + rejectedOutgoing.length;
  const pendingCRs = myChangeRequests.filter((cr) => cr.status === "PENDING");

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f8fafc", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      <style>{`
        .tab-pill { border: none; cursor: pointer; padding: 9px 18px; border-radius: 8px; font-weight: 600; font-size: 13px; transition: all 0.15s; display: flex; align-items: center; gap: 7px; }
        .tab-pill:hover { opacity: 0.85; }
        .main-tab { border: none; cursor: pointer; padding: 10px 24px; font-size: 14px; font-weight: 700; border-bottom: 3px solid transparent; background: none; transition: all 0.15s; }
        .main-tab:hover { color: #1e293b; }
        .action-btn { border: none; cursor: pointer; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; transition: opacity 0.15s; }
        .action-btn:hover { opacity: 0.8; }
        .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin-bottom: 10px; transition: box-shadow 0.15s; }
        .card:hover { box-shadow: 0 2px 14px rgba(0,0,0,0.07); }
        .back-btn { border: none; cursor: pointer; background: none; color: #64748b; font-size: 14px; padding: 6px 12px; border-radius: 6px; display: flex; align-items: center; gap: 6px; transition: background 0.15s; }
        .back-btn:hover { background: #e2e8f0; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 10px; }
        .select-input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; background: #fff; }
        .modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(2px); }
        .modal-box { background: #fff; border-radius: 16px; padding: 28px; width: 460px; max-width: 95vw; box-shadow: 0 24px 64px rgba(0,0,0,0.2); }
      `}</style>

      {/* Main tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px", display: "flex", gap: 0 }}>
        {([
          { key: "acciones"    as MainTab, label: "Acciones",            badge: myTasks.length + rejectedCount },
          { key: "seguimiento" as MainTab, label: "Seguimiento",         badge: docCounts.enRevision + docCounts.atrasadas + pendingCRs.length },
          ...(isAdmin ? [{ key: "equipo" as MainTab, label: "Equipo", badge: teamTasks.length }] : []),
        ]).map((t) => (
          <button
            key={t.key}
            className="main-tab"
            onClick={() => setMainTab(t.key)}
            style={{
              color: mainTab === t.key ? p : "#94a3b8",
              borderBottomColor: mainTab === t.key ? p : "transparent",
              display: "flex", alignItems: "center", gap: 7,
            }}
          >
            {t.label}
            {t.badge > 0 && (
              <span style={{
                background: mainTab === t.key ? p : "#e2e8f0",
                color: mainTab === t.key ? "#fff" : "#64748b",
                borderRadius: 20, padding: "1px 7px", fontSize: 11, fontWeight: 700,
              }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Section A: Mis Tareas / Tareas del Equipo ───────────────────────── */}
        {(mainTab === "acciones" || mainTab === "equipo") && (
          <section style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
                  {mainTab === "acciones" ? "Mis Tareas Asignadas" : "Tareas del Equipo"}
                </h2>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>
                  {mainTab === "acciones"
                    ? "Tareas asignadas específicamente a ti"
                    : "Todas las tareas abiertas en la empresa"}
                </p>
              </div>

              {/* Admin team view filters + assign button */}
              {isAdmin && mainTab === "equipo" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select className="select-input" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
                    <option value="">Todos los usuarios</option>
                    {companyUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <select className="select-input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="">Todos los tipos</option>
                    {(["REVIEW","UPDATE","APPROVE","OTHER"] as TaskType[]).map((t) => (
                      <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => openAssignModal("", "")}
                    style={{ background: p, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    + Asignar tarea
                  </button>
                </div>
              )}
            </div>

            {loadingTasksNow ? (
              [1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 10 }} />)
            ) : tasksToShow.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
                <div style={{ marginBottom: 10 }}><CheckCircle size={40} color="#22c55e" /></div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  {mainTab === "acciones" ? "No tienes tareas pendientes" : "No hay tareas abiertas en el equipo"}
                </div>
              </div>
            ) : (
              tasksToShow.map((task) => {
                const tc = TASK_TYPE_COLORS[task.type];
                const isCompleting = completing === task.id;
                const canComplete = task.assignedTo.id === userId || task.assignedBy.id === userId;
                const isChainTask = !!task.reviewChainId && task.stepOrder !== null;
                const isMyChainTurn = isChainTask && task.assignedTo.id === userId;
                const isOutTask = !!task.outgoingRequestId && !!task.outgoingRequest;
                const isMyOutTurn = isOutTask && task.assignedTo.id === userId;
                const OUT_TYPE_LABELS: Record<string, string> = { ACTUALIZACION: "Actualización", REVISION: "Revisión", CORRECCION: "Corrección" };
                const docName = task.file.nombreDocumento || task.file.name;
                return (
                  <div key={task.id} className="card" style={{ borderLeft: task.isOverdue ? "4px solid #dc2626" : isChainTask ? `4px solid #7c3aed` : `4px solid ${p}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <FileIcon mimeType={task.file.mimeType} size={30} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Title row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>
                            {docName}
                          </span>
                          <span style={{ background: tc.bg, color: tc.color, borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {TASK_TYPE_LABELS[task.type]}
                          </span>
                          {isChainTask && (
                            <span style={{ background: "#ede9fe", color: "#6d28d9", borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                              Cadena · Paso {task.stepOrder}/{task.chainTotalSteps}
                            </span>
                          )}
                          {isOutTask && task.outgoingRequest && (
                            <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                              Solicitud saliente · {OUT_TYPE_LABELS[task.outgoingRequest.type]}
                            </span>
                          )}
                          {task.isOverdue && (
                            <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                              ATRASADA
                            </span>
                          )}
                          <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: 6, padding: "1px 8px", fontSize: 11 }}>
                            {TASK_STATUS_LABELS[task.status]}
                          </span>
                        </div>

                        {/* Meta row */}
                        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                          {task.file.codigo && <span>Código: <b>{task.file.codigo}</b></span>}
                          <span>Asignado por: <b>{task.assignedBy.name}</b></span>
                          {mainTab === "equipo" && <span>Asignado a: <b>{task.assignedTo.name}</b></span>}
                          {task.dueDate && (
                            <span style={{ color: task.isOverdue ? "#dc2626" : "#64748b", fontWeight: task.isOverdue ? 700 : 400 }}>
                              Vence: <b>{new Date(task.dueDate).toLocaleDateString("es-MX")}</b>
                            </span>
                          )}
                          {task.file.folder && <span>Carpeta: {task.file.folder.name}</span>}
                        </div>

                        {/* Notes */}
                        {task.notes && (
                          <div style={{ marginTop: 8, padding: "8px 12px", background: "#f8fafc", borderRadius: 6, fontSize: 12, color: "#475569", borderLeft: "3px solid #e2e8f0" }}>
                            {task.notes}
                          </div>
                        )}

                        {/* Motivo de devolución */}
                        {task.rejectionNote && (
                          <div style={{ marginTop: 8, padding: "8px 12px", background: "#fff7ed", borderRadius: 6, fontSize: 12, color: "#92400e", borderLeft: "3px solid #f59e0b" }}>
                            <span style={{ fontWeight: 700 }}>Motivo de devolución:</span> {task.rejectionNote}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                        {isViewable(task.file.mimeType) ? (
                          <>
                            <button
                              className="action-btn"
                              style={{ background: "#f1f5f9", color: "#475569" }}
                              onClick={() => openPreview({ id: task.file.id, name: task.file.nombreDocumento || task.file.name, mimeType: task.file.mimeType })}
                            >
                              Ver
                            </button>
                            <button
                              className="action-btn"
                              style={{ background: "#f1f5f9", color: "#475569", opacity: openingDoc === task.file.id ? 0.5 : 1 }}
                              disabled={openingDoc === task.file.id}
                              onClick={() => openDoc(task.file.id)}
                            >
                              {openingDoc === task.file.id ? "…" : "Descargar"}
                            </button>
                          </>
                        ) : (
                          <button
                            className="action-btn"
                            style={{ background: "#f1f5f9", color: "#475569", opacity: openingDoc === task.file.id ? 0.5 : 1 }}
                            disabled={openingDoc === task.file.id}
                            onClick={() => openDoc(task.file.id)}
                          >
                            {openingDoc === task.file.id ? "…" : "Ver doc"}
                          </button>
                        )}

                        {/* Review chain actions */}
                        {isMyChainTurn && task.status !== "COMPLETED" && (
                          <>
                            <button
                              className="action-btn"
                              style={{ background: "#dcfce7", color: "#166534" }}
                              onClick={() => { setChainNotes(""); setChainError(""); setChainModal({ taskId: task.id, action: "APPROVE", docName, stepOrder: task.stepOrder! }); }}
                            >
                              Aprobar
                            </button>
                            {(task.stepOrder ?? 1) > 1 && (
                              <button
                                className="action-btn"
                                style={{ background: "#fff7ed", color: "#d97706" }}
                                onClick={() => { setChainNotes(""); setChainError(""); setChainModal({ taskId: task.id, action: "RETURN_TO_PREVIOUS", docName, stepOrder: task.stepOrder! }); }}
                              >
                                Devolver
                              </button>
                            )}
                            <button
                              className="action-btn"
                              style={{ background: "#fee2e2", color: "#dc2626" }}
                              onClick={() => { setChainNotes(""); setChainError(""); setChainModal({ taskId: task.id, action: "REJECT", docName, stepOrder: task.stepOrder! }); }}
                            >
                              Rechazar
                            </button>
                          </>
                        )}

                        {/* Outgoing request submit button */}
                        {isMyOutTurn && task.status !== "COMPLETED" && (
                          <button
                            className="action-btn"
                            style={{ background: "#fef3c7", color: "#92400e" }}
                            onClick={() => openOutModal(task)}
                          >
                            Responder
                          </button>
                        )}

                        {/* Non-chain complete button */}
                        {!isChainTask && !isOutTask && canComplete && task.status !== "COMPLETED" && (
                          <button
                            className="action-btn"
                            style={{ background: "#dcfce7", color: "#166534", opacity: isCompleting ? 0.5 : 1 }}
                            disabled={isCompleting}
                            onClick={() => completeTask(task.id)}
                          >
                            {isCompleting ? "…" : "Completar"}
                          </button>
                        )}

                        {isAdmin && mainTab === "equipo" && !isChainTask && (
                          <button
                            className="action-btn"
                            style={{ background: p + "18", color: p }}
                            onClick={() => openAssignModal(task.file.id, docName)}
                          >
                            + Asignar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* ── Section B: Estado General de Documentos ──────────────────────────── */}
        {mainTab === "seguimiento" && (
          <section style={{ marginBottom: 48 }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Estado General de Documentos</h2>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>Estado del documento en sí, independiente de las tareas asignadas</p>
            </div>

            {/* Doc status tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {docTabs.map((t) => (
                <button
                  key={t.key}
                  className="tab-pill"
                  style={{
                    background: docTab === t.key ? t.color : "#fff",
                    color: docTab === t.key ? "#fff" : "#64748b",
                    border: docTab === t.key ? `2px solid ${t.color}` : "2px solid #e2e8f0",
                  }}
                  onClick={() => setDocTab(t.key)}
                >
                  {t.label}
                  <span style={{
                    background: docTab === t.key ? "rgba(255,255,255,0.25)" : t.color + "22",
                    color: docTab === t.key ? "#fff" : t.color,
                    borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700,
                  }}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {loadingDocs ? (
              [1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8 }} />)
            ) : docFiles.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                <div style={{ marginBottom: 8 }}><ClipboardList size={36} color="#cbd5e1" /></div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>No hay documentos en esta categoría</div>
              </div>
            ) : (
              docFiles.map((f) => {
                const sc = DOC_STATUS_COLORS[f.status] ?? DOC_STATUS_COLORS.DRAFT;
                return (
                  <div key={f.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    <FileIcon mimeType={f.mimeType} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{f.nombreDocumento || f.name}</span>
                        {f.isOverdue && <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 8, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>ATRASADO</span>}
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                        {f.codigo && <span>Código: <b>{f.codigo}</b></span>}
                        {f.encargadoDocumento && <span>Encargado: <b>{f.encargadoDocumento.name}</b></span>}
                        {f.fechaRevision && <span>Revisión: <b>{new Date(f.fechaRevision).toLocaleDateString("es-MX")}</b></span>}
                      </div>
                    </div>
                    <span style={{ background: sc.bg, color: sc.color, borderRadius: 7, padding: "3px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {DOC_STATUS_LABELS[f.status]}
                    </span>
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        <button className="action-btn" style={{ background: p + "18", color: p }}
                          onClick={() => openAssignModal(f.id, f.nombreDocumento || f.name)}>
                          Asignar
                        </button>
                        {f.status !== "REVIEWED" && (
                          <button className="action-btn" style={{ background: "#dcfce7", color: "#166534" }}
                            onClick={() => changeDocStatus(f.id, "REVIEWED")}>
                            Revisado
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* ── Section C: Rechazados / Devueltos ───────────────────────────────── */}
        {mainTab === "acciones" && (rejectedCRs.length > 0 || rejectedChains.length > 0 || rejectedOutgoing.length > 0 || loadingRejected) && (
          <section style={{ marginBottom: 48 }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#dc2626" }}>Rechazados / Devueltos</h2>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>
                Documentos que fueron rechazados o devueltos con observaciones
              </p>
            </div>

            {loadingRejected ? (
              [1,2].map((i) => <div key={i} className="skeleton" style={{ height: 72, marginBottom: 8 }} />)
            ) : (
              <>
                {rejectedChains.map((chain) => {
                  const f = chain.file;
                  const docName = f?.nombreDocumento || f?.name || "Documento eliminado";
                  const reason = chain.rejectionNote ?? chain.rejectingStep?.rejectionNote ?? null;
                  const rejectedBy = chain.rejectingStep?.assignedTo?.name ?? "Revisor";
                  return (
                    <div key={chain.id} style={{ background: "#fff", border: "1px solid #fca5a5", borderLeft: "4px solid #dc2626", borderRadius: 10, padding: "14px 18px", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                        {f && <FileIcon mimeType={f.mimeType} size={28} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{docName}</span>
                            <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                              Cadena rechazada
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                            {f?.codigo && <span>Código: <b>{f.codigo}</b></span>}
                            <span>Rechazado por: <b>{rejectedBy}</b></span>
                            <span>Fecha: <b>{new Date(chain.updatedAt).toLocaleDateString("es-MX")}</b></span>
                          </div>
                          {reason && (
                            <div style={{ marginTop: 8, padding: "7px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
                              <b>Motivo:</b> {reason}
                            </div>
                          )}
                        </div>
                        {f && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                            <button
                              className="action-btn"
                              style={{ background: "#f1f5f9", color: "#475569", opacity: openingDoc === f.id ? 0.5 : 1 }}
                              disabled={openingDoc === f.id}
                              onClick={() => openDoc(f.id)}
                            >
                              {openingDoc === f.id ? "…" : "Ver documento"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {rejectedCRs.map((cr) => {
                  const f = cr.file;
                  const docName = f?.nombreDocumento || f?.name || "Documento eliminado";
                  const rejectedBy = cr.reviewedBy?.name ?? "Administrador";
                  return (
                    <div key={cr.id} style={{ background: "#fff", border: "1px solid #fca5a5", borderLeft: "4px solid #f97316", borderRadius: 10, padding: "14px 18px", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                        {f && <FileIcon mimeType={f.mimeType} size={28} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{docName}</span>
                            <span style={{ background: "#fff7ed", color: "#c2410c", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                              Solicitud rechazada
                            </span>
                            <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 5, padding: "1px 7px", fontSize: 11 }}>
                              {CR_TYPE_LABELS[cr.type] ?? cr.type}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                            {f?.codigo && <span>Código: <b>{f.codigo}</b></span>}
                            <span>Rechazado por: <b>{rejectedBy}</b></span>
                            {cr.reviewedAt && <span>Fecha: <b>{new Date(cr.reviewedAt).toLocaleDateString("es-MX")}</b></span>}
                          </div>
                          {cr.adminNotes && (
                            <div style={{ marginTop: 8, padding: "7px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
                              <b>Motivo:</b> {cr.adminNotes}
                            </div>
                          )}
                        </div>
                        {f && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                            <button
                              className="action-btn"
                              style={{ background: "#f1f5f9", color: "#475569", opacity: openingDoc === f.id ? 0.5 : 1 }}
                              disabled={openingDoc === f.id}
                              onClick={() => openDoc(f.id)}
                            >
                              {openingDoc === f.id ? "…" : "Ver documento"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {rejectedOutgoing.map((o) => {
                  const f = o.file;
                  const docName = f?.nombreDocumento || f?.name || "Documento eliminado";
                  const rejectedBy = o.finalReviewer?.name ?? "Administrador";
                  const typeLabel = { ACTUALIZACION: "Actualización", REVISION: "Revisión", CORRECCION: "Corrección" }[o.type] ?? o.type;
                  return (
                    <div key={o.id} style={{ background: "#fff", border: "1px solid #fca5a5", borderLeft: "4px solid #8b5cf6", borderRadius: 10, padding: "14px 18px", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                        {f && <FileIcon mimeType={f.mimeType} size={28} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{docName}</span>
                            <span style={{ background: "#ede9fe", color: "#6d28d9", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                              Solicitud saliente rechazada
                            </span>
                            <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 5, padding: "1px 7px", fontSize: 11 }}>
                              {typeLabel}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                            {f?.codigo && <span>Código: <b>{f.codigo}</b></span>}
                            <span>Rechazado por: <b>{rejectedBy}</b></span>
                            {o.finalReviewedAt && <span>Fecha: <b>{new Date(o.finalReviewedAt).toLocaleDateString("es-MX")}</b></span>}
                          </div>
                          {o.finalNotes && (
                            <div style={{ marginTop: 8, padding: "7px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
                              <b>Motivo:</b> {o.finalNotes}
                            </div>
                          )}
                        </div>
                        {f && isViewable(f.mimeType) && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                            <button
                              className="action-btn"
                              style={{ background: "#f1f5f9", color: "#475569" }}
                              onClick={() => openPreview({ id: f.id, name: f.name, mimeType: f.mimeType })}
                            >
                              Ver
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </section>
        )}

        {/* ── Section D: Mis Solicitudes de Cambio (solo PENDING) ──────────────── */}
        {mainTab === "seguimiento" && (
          <section style={{ marginTop: 48 }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Mis Solicitudes Pendientes</h2>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>
                Cambios enviados al administrador que aun no han sido revisados
              </p>
            </div>

            {loadingCR ? (
              [1,2].map((i) => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8 }} />)
            ) : pendingCRs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>No tienes solicitudes pendientes de revision</div>
              </div>
            ) : (
              pendingCRs.map((cr) => {
                const sc = CR_STATUS_COLORS[cr.status] ?? CR_STATUS_COLORS.PENDING;
                const docName = cr.file?.nombreDocumento || cr.file?.name || "Documento eliminado";
                return (
                  <div key={cr.id} style={{ background: "#fff", border: `1px solid #e2e8f0`, borderLeft: `4px solid ${sc.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Title + badges */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{docName}</span>
                          <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>
                            {CR_TYPE_LABELS[cr.type] ?? cr.type}
                          </span>
                        </div>
                        {/* Meta */}
                        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                          {cr.file?.codigo && <span>Código: <b>{cr.file.codigo}</b></span>}
                          <span>Enviada: <b>{new Date(cr.createdAt).toLocaleDateString("es-MX")}</b></span>
                          {cr.reviewedAt && (
                            <span>Revisada: <b>{new Date(cr.reviewedAt).toLocaleDateString("es-MX")}</b></span>
                          )}
                        </div>
                        {/* Admin notes on rejection */}
                        {cr.status === "REJECTED" && cr.adminNotes && (
                          <div style={{ marginTop: 8, padding: "7px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
                            <b>Motivo:</b> {cr.adminNotes}
                          </div>
                        )}
                      </div>
                      {/* Status badge */}
                      <span style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, borderRadius: 7, padding: "4px 12px", fontSize: 12, fontWeight: 700, flexShrink: 0, alignSelf: "center" }}>
                        {CR_STATUS_LABELS[cr.status]}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}
      </div>

      {/* ── Outgoing request submit modal ───────────────────────────────────── */}
      {outModal && (
        <div className="modal-backdrop" onClick={() => !outSubmitting && setOutModal(null)}>
          <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
                Responder solicitud — {outModal.outgoingRequest.type === "ACTUALIZACION" ? "Actualización" : outModal.outgoingRequest.type === "REVISION" ? "Revisión" : "Corrección"}
              </h3>
              {!outSubmitting && (
                <button onClick={() => setOutModal(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "#64748b" }}><X size={14} /></button>
              )}
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
              <b>{outModal.docName}</b>
              {outModal.currentVersion && <span style={{ color: "#94a3b8", marginLeft: 8 }}>Versión actual: {outModal.currentVersion}</span>}
            </div>

            {outModal.outgoingRequest.instructions && (
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#1e40af" }}>
                <b>Instrucciones:</b> {outModal.outgoingRequest.instructions}
              </div>
            )}

            {/* Step 2: show step 1 result */}
            {outModal.outgoingRequest.totalSteps === 2 && outModal.outgoingRequest.step1OutcomeType && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#166534" }}>
                <b>Resultado del paso anterior:</b>{" "}
                {outModal.outgoingRequest.step1OutcomeType === "no_changes" ? "Sin cambios necesarios"
                  : outModal.outgoingRequest.step1OutcomeType === "new_version" ? `Nueva versión (${outModal.outgoingRequest.step1VersionStr ?? "—"})`
                  : "Corrección aplicada"}
              </div>
            )}

            {/* Outcome selection */}
            {outModal.outgoingRequest.type === "REVISION" && (
              <div style={{ marginBottom: 16 }}>
                <label style={ls}>Resultado de la revisión</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="radio" name="outcome" checked={outOutcome === "no_changes"} onChange={() => setOutOutcome("no_changes")} />
                    El documento está correcto, no requiere cambios
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="radio" name="outcome" checked={outOutcome === "new_version"} onChange={() => setOutOutcome("new_version")} />
                    Se requieren cambios — subir nueva versión
                  </label>
                </div>
              </div>
            )}

            {/* File upload */}
            {(outModal.outgoingRequest.type === "ACTUALIZACION" || outOutcome === "new_version" || (outModal.outgoingRequest.type === "CORRECCION" && outModal.outgoingRequest.correctionFields?.contenido)) && (
              <div style={{ marginBottom: 16 }}>
                <label style={ls}>
                  Archivo{outModal.outgoingRequest.type === "ACTUALIZACION" || outModal.outgoingRequest.correctionFields?.contenido ? " *" : " (opcional)"}
                </label>
                <input
                  type="file"
                  onChange={(e) => setOutFile(e.target.files?.[0] ?? null)}
                  style={{ width: "100%", fontSize: 13, padding: "6px 0" }}
                />
                {outFile && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{outFile.name} ({(outFile.size / 1024).toFixed(0)} KB)</div>}
              </div>
            )}

            {/* Version label */}
            {(outOutcome === "new_version" || outModal.outgoingRequest.type === "ACTUALIZACION") && (
              <div style={{ marginBottom: 16 }}>
                <label style={ls}>Etiqueta de versión (ej. v1.2)</label>
                <input
                  style={inputS}
                  value={outVersionStr}
                  onChange={(e) => setOutVersionStr(e.target.value)}
                  placeholder="v1.2"
                />
              </div>
            )}

            {/* Correction metadata fields */}
            {outModal.outgoingRequest.type === "CORRECCION" && (
              <>
                {outModal.outgoingRequest.correctionFields?.nombre && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={ls}>Nombre del documento corregido</label>
                    <input style={inputS} value={outNombreDoc} onChange={(e) => setOutNombreDoc(e.target.value)} placeholder="Nuevo nombre del documento" />
                  </div>
                )}
                {outModal.outgoingRequest.correctionFields?.area && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={ls}>Área / departamento</label>
                    <input style={inputS} value={outDepartamento} onChange={(e) => setOutDepartamento(e.target.value)} placeholder="Área o departamento" />
                  </div>
                )}
              </>
            )}

            {outError && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px" }}>{outError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={submitOutModal}
                disabled={outSubmitting}
                style={{ flex: 1, background: "#d97706", color: "#fff", border: "none", padding: "11px", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: outSubmitting ? 0.7 : 1 }}
              >
                {outSubmitting ? "Enviando…" : "Enviar respuesta"}
              </button>
              <button onClick={() => !outSubmitting && setOutModal(null)} disabled={outSubmitting} style={{ background: "#f1f5f9", color: "#64748b", border: "none", padding: "11px 16px", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review chain action modal ────────────────────────────────────────── */}
      {chainModal && (
        <div className="modal-backdrop" onClick={() => !chainWorking && setChainModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: chainModal.action === "APPROVE" ? "#166534" : chainModal.action === "REJECT" ? "#dc2626" : "#d97706" }}>
                {chainModal.action === "APPROVE" ? "Aprobar revisión" : chainModal.action === "REJECT" ? "Rechazar documento" : "Devolver al revisor anterior"}
              </h3>
              {!chainWorking && (
                <button onClick={() => setChainModal(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", color: "#64748b" }}><X size={14} /></button>
              )}
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#374151" }}>
              <b>{chainModal.docName}</b> — Paso {chainModal.stepOrder}
            </div>

            {chainModal.action === "APPROVE" && (
              <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
                {chainModal.stepOrder === (tasksToShow.find(t => t.id === chainModal.taskId)?.chainTotalSteps ?? 1)
                  ? "Eres el último revisor. Al aprobar, el documento pasará a aprobación final del administrador."
                  : "Al aprobar, el documento avanza al siguiente revisor en la cadena."}
              </p>
            )}
            {chainModal.action === "RETURN_TO_PREVIOUS" && (
              <p style={{ fontSize: 13, color: "#92400e", margin: "0 0 12px" }}>
                El revisor anterior recibirá el documento de vuelta con tu nota.
              </p>
            )}
            {chainModal.action === "REJECT" && (
              <p style={{ fontSize: 13, color: "#dc2626", margin: "0 0 12px" }}>
                El documento volverá al estado Borrador y se notificará al creador. Esta acción termina la cadena de revisión.
              </p>
            )}

            {(chainModal.action === "RETURN_TO_PREVIOUS" || chainModal.action === "REJECT") && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...ls, textTransform: "none" }}>Nota <span style={{ color: "#dc2626" }}>*</span></label>
                <textarea
                  style={{ ...inputS, height: 90, resize: "vertical" }}
                  value={chainNotes}
                  onChange={(e) => setChainNotes(e.target.value)}
                  placeholder={chainModal.action === "REJECT" ? "Explica por qué se rechaza el documento…" : "Indica qué debe corregir el revisor anterior…"}
                  autoFocus
                />
              </div>
            )}

            {chainModal.action === "APPROVE" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...ls, textTransform: "none" }}>Comentario <span style={{ color: "#94a3b8", fontWeight: 400 }}>(opcional)</span></label>
                <textarea
                  style={{ ...inputS, height: 70, resize: "vertical" }}
                  value={chainNotes}
                  onChange={(e) => setChainNotes(e.target.value)}
                  placeholder="Observaciones para el registro de auditoría…"
                />
              </div>
            )}

            {chainError && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px" }}>{chainError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={submitChainAction}
                disabled={chainWorking}
                style={{
                  flex: 1, border: "none", padding: "11px", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer",
                  background: chainModal.action === "APPROVE" ? "#16a34a" : chainModal.action === "REJECT" ? "#dc2626" : "#d97706",
                  color: "#fff", opacity: chainWorking ? 0.7 : 1,
                }}
              >
                {chainWorking ? "Procesando…" : chainModal.action === "APPROVE" ? "Confirmar aprobación" : chainModal.action === "REJECT" ? "Rechazar documento" : "Devolver al anterior"}
              </button>
              <button onClick={() => !chainWorking && setChainModal(null)} disabled={chainWorking} style={{ background: "#f1f5f9", color: "#64748b", border: "none", padding: "11px 16px", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Office viewer modal ─────────────────────────────────────────────── */}
      {officeViewerFile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#1e293b", color: "#fff", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{officeViewerFile.name}</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
              {officeDownloadUrl && (
                <button onClick={() => window.open(officeDownloadUrl, "_blank")} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                  Descargar
                </button>
              )}
              <button onClick={() => { setOfficeViewerFile(null); setOfficeViewerSheets([]); setOfficeDownloadUrl(null); }} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "5px 10px", borderRadius: 6, cursor: "pointer", display: "flex" }}>
                <X size={16} />
              </button>
            </div>
          </div>
          {officeViewerSheets.length > 1 && !isWord(officeViewerFile.mimeType) && (
            <div style={{ background: "#0f172a", display: "flex", gap: 2, padding: "0 20px", flexShrink: 0 }}>
              {officeViewerSheets.map((s, i) => (
                <button key={i} onClick={() => setOfficeViewerTab(i)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: officeViewerTab === i ? 700 : 400, background: officeViewerTab === i ? "#fff" : "transparent", color: officeViewerTab === i ? "#1e293b" : "rgba(255,255,255,0.6)", border: "none", borderRadius: "6px 6px 0 0", cursor: "pointer" }}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ flex: 1, overflow: "auto", background: "#f8fafc" }}>
            {officeViewerLoading ? (
              <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#475569", fontSize: 14 }}>Cargando documento…</div>
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
                  .word-view p { margin: 0 0 10px; }
                  .word-view table { border-collapse: collapse; width: 100%; margin: 12px 0; }
                  .word-view td, .word-view th { border: 1px solid #d1d5db; padding: 6px 10px; }
                  .word-view ul, .word-view ol { margin: 0 0 10px; padding-left: 24px; }
                `}</style>
                <div className={isWord(officeViewerFile.mimeType) ? "word-view" : "xlsx-view"} dangerouslySetInnerHTML={{ __html: officeViewerSheets[officeViewerTab]?.html ?? "" }} />
              </div>
            ) : (
              <div style={{ padding: "60px 40px", textAlign: "center", color: "#475569" }}>
                <p style={{ margin: "0 0 8px", fontWeight: 600 }}>No se puede previsualizar</p>
                {officeDownloadUrl && <button onClick={() => window.open(officeDownloadUrl, "_blank")} style={{ background: p, color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Descargar</button>}
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
            <button onClick={() => { setPdfViewerFile(null); setPdfViewerUrl(null); }} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "5px 10px", borderRadius: 6, cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {pdfLoading ? (
              <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#fff" }}>Cargando PDF…</div>
            ) : pdfViewerUrl ? (
              <iframe src={pdfViewerUrl} style={{ width: "100%", height: "100%", border: "none" }} title={pdfViewerFile.name} />
            ) : (
              <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#94a3b8" }}>No se pudo cargar el PDF.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Assign task modal ────────────────────────────────────────────────── */}
      {showAssign && (
        <div className="modal-backdrop" onClick={() => setShowAssign(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Asignar tarea</h3>
              <button onClick={() => setShowAssign(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", color: "#64748b" }}><X size={14} /></button>
            </div>

            {assignForm.docName && (
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 13, color: "#0369a1" }}>
                Documento: <b>{assignForm.docName}</b>
              </div>
            )}

            {!assignForm.fileId && (
              <div style={{ marginBottom: 14 }}>
                <label style={ls}>Documento (ID)</label>
                <input
                  style={inputS} placeholder="Pega el ID del documento o usa los botones de la lista"
                  value={assignForm.fileId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, fileId: e.target.value }))}
                />
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={ls}>Asignar a</label>
              <select style={inputS} value={assignForm.assignedToUserId} onChange={(e) => setAssignForm((f) => ({ ...f, assignedToUserId: e.target.value }))}>
                <option value="">Selecciona un usuario…</option>
                {companyUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={ls}>Tipo de tarea</label>
              <select style={inputS} value={assignForm.type} onChange={(e) => setAssignForm((f) => ({ ...f, type: e.target.value as TaskType }))}>
                {(["REVIEW","UPDATE","APPROVE","OTHER"] as TaskType[]).map((t) => (
                  <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={ls}>Fecha límite <span style={{ color: "#94a3b8", fontWeight: 400 }}>(opcional)</span></label>
              <input type="date" style={inputS} value={assignForm.dueDate} onChange={(e) => setAssignForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={ls}>Notas / instrucciones <span style={{ color: "#94a3b8", fontWeight: 400 }}>(opcional)</span></label>
              <textarea
                style={{ ...inputS, height: 80, resize: "vertical" }}
                value={assignForm.notes}
                onChange={(e) => setAssignForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Instrucciones para el usuario asignado…"
              />
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", marginBottom: 20 }}>
              <input
                type="checkbox"
                checked={assignForm.autoApproveOnCompletion}
                onChange={(e) => setAssignForm((f) => ({ ...f, autoApproveOnCompletion: e.target.checked }))}
                style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0, cursor: "pointer" }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Aprobar cambios automáticamente al completar</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  Si está activo, al marcar la tarea como completada los cambios se aplican directamente.
                  Si no, el usuario deberá enviar una solicitud de aprobación.
                </div>
              </div>
            </label>

            {assignError && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>{assignError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={submitAssign}
                disabled={submittingAssign}
                style={{ flex: 1, background: p, color: "#fff", border: "none", padding: "11px", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: submittingAssign ? 0.7 : 1 }}
              >
                {submittingAssign ? "Asignando…" : "Asignar tarea"}
              </button>
              <button onClick={() => setShowAssign(false)} style={{ background: "#f1f5f9", color: "#64748b", border: "none", padding: "11px 16px", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ls: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 };
const inputS: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, boxSizing: "border-box" };
