"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ClipboardList, X } from "lucide-react";
import FileIcon from "@/components/FileIcon";

// ─── Types ─────────────────────────────────────────────────────────────────────

type MainTab = "mis" | "equipo";
type DocTab  = "en_revision" | "borrador" | "revisados" | "atrasadas";

type TaskType   = "REVIEW" | "UPDATE" | "APPROVE" | "OTHER";
type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

interface TaskFile {
  id: string; name: string; nombreDocumento: string | null;
  codigo: string | null; versionStr: string | null; mimeType: string;
  status: string; folder: { id: string; name: string } | null;
}
interface TaskUser { id: string; name: string; email: string; }
interface Task {
  id: string; type: TaskType; status: TaskStatus;
  dueDate: string | null; notes: string | null;
  createdAt: string; completedAt: string | null; isOverdue: boolean;
  file: TaskFile; assignedTo: TaskUser; assignedBy: TaskUser;
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
  const [mainTab, setMainTab] = useState<MainTab>("mis");
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

  // ── completing a task
  const [completing, setCompleting] = useState<string | null>(null);

  // ── change requests (Mis Solicitudes)
  const [myChangeRequests, setMyChangeRequests] = useState<ChangeRequest[]>([]);
  const [loadingCR, setLoadingCR] = useState(true);

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

  useEffect(() => { fetchMyTasks(); fetchDocCounts(); fetchDocFiles(docTab); fetchMyChangeRequests(); }, []);
  useEffect(() => { if (isAdmin && mainTab === "equipo") { fetchTeamTasks(); fetchCompanyUsers(); } }, [mainTab, filterUser, filterType]);
  useEffect(() => { fetchDocFiles(docTab); }, [docTab]);

  // ── complete a task
  const completeTask = async (taskId: string) => {
    setCompleting(taskId);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    await Promise.all([fetchMyTasks(), fetchDocCounts(), fetchDocFiles(docTab), fetchMyChangeRequests()]);
    if (isAdmin && mainTab === "equipo") await fetchTeamTasks();
    setCompleting(null);
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
    { key: "borrador"    as DocTab, label: "Borradores",           count: docCounts.borrador,   color: "#92400e" },
    { key: "revisados"   as DocTab, label: "Revisados",            count: docCounts.revisados,  color: "#166534" },
    { key: "atrasadas"   as DocTab, label: "Revisiones Atrasadas", count: docCounts.atrasadas,  color: "#dc2626" },
  ];

  const tasksToShow = mainTab === "equipo" ? teamTasks : myTasks;
  const loadingTasksNow = loadingTasks && mainTab === "mis";

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
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

      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px", height: 60, display: "flex", alignItems: "center", gap: 16 }}>
        <button className="back-btn" onClick={() => router.push("/dashboard")}>← Volver al Dashboard</button>
        <div style={{ width: 1, height: 24, background: "#e2e8f0" }} />
        <span style={{ fontWeight: 700, fontSize: 18, color: "#1e293b" }}>Pendientes</span>
      </div>

      {/* Admin main tabs */}
      {isAdmin && (
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px", display: "flex", gap: 0 }}>
          {(["mis", "equipo"] as MainTab[]).map((t) => (
            <button
              key={t}
              className="main-tab"
              onClick={() => setMainTab(t)}
              style={{
                color: mainTab === t ? p : "#94a3b8",
                borderBottomColor: mainTab === t ? p : "transparent",
              }}
            >
              {t === "mis" ? "Mis Pendientes" : "Pendientes del Equipo"}
            </button>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Section A: Mis Tareas Asignadas ─────────────────────────────────── */}
        {(mainTab === "mis" || mainTab === "equipo") && (
          <section style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
                  {mainTab === "mis" ? "Mis Tareas Asignadas" : "Tareas del Equipo"}
                </h2>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>
                  {mainTab === "mis"
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
                  {mainTab === "mis" ? "No tienes tareas pendientes" : "No hay tareas abiertas en el equipo"}
                </div>
              </div>
            ) : (
              tasksToShow.map((task) => {
                const tc = TASK_TYPE_COLORS[task.type];
                const isCompleting = completing === task.id;
                const canComplete = task.assignedTo.id === userId || task.assignedBy.id === userId;
                return (
                  <div key={task.id} className="card" style={{ borderLeft: task.isOverdue ? "4px solid #dc2626" : `4px solid ${p}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <FileIcon mimeType={task.file.mimeType} size={30} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Title row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>
                            {task.file.nombreDocumento || task.file.name}
                          </span>
                          <span style={{ background: tc.bg, color: tc.color, borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {TASK_TYPE_LABELS[task.type]}
                          </span>
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
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                        <button
                          className="action-btn"
                          style={{ background: "#f1f5f9", color: "#475569" }}
                          onClick={() => window.open(`/api/files/${task.file.id}/download-url`, "_blank")}
                        >
                          Ver doc
                        </button>
                        {canComplete && task.status !== "COMPLETED" && (
                          <button
                            className="action-btn"
                            style={{ background: "#dcfce7", color: "#166534", opacity: isCompleting ? 0.5 : 1 }}
                            disabled={isCompleting}
                            onClick={() => completeTask(task.id)}
                          >
                            {isCompleting ? "…" : "Completar"}
                          </button>
                        )}
                        {isAdmin && mainTab === "equipo" && (
                          <button
                            className="action-btn"
                            style={{ background: p + "18", color: p }}
                            onClick={() => openAssignModal(task.file.id, task.file.nombreDocumento || task.file.name)}
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
        {mainTab === "mis" && (
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

        {/* ── Section C: Mis Solicitudes de Cambio ─────────────────────────────── */}
        {mainTab === "mis" && (
          <section>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Mis Solicitudes de Cambio</h2>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>
                Cambios que enviaste para aprobación del administrador
              </p>
            </div>

            {loadingCR ? (
              [1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8 }} />)
            ) : myChangeRequests.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📝</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>No tienes solicitudes de cambio</div>
              </div>
            ) : (
              myChangeRequests.map((cr) => {
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
