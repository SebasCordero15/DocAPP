"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import FileIcon from "@/components/FileIcon";

// ─── types ────────────────────────────────────────────────────────────────────

interface FolderFlat {
  id: string;
  name: string;
  parentId: string | null;
}

interface FileFlat {
  id: string;
  name: string;
  folderId: string | null;
  mimeType: string;
}

interface FolderNode extends FolderFlat {
  children: FolderNode[];
}

interface PermEntry {
  user: { id: string; name: string; email: string; role: string };
  explicit: string | null;
  effective: string;
  source: string; // "admin" | "direct" | "folder:Name" | "none"
}

interface SelectedResource {
  type: "folder" | "file";
  id: string;
  name: string;
}

interface Props {
  company: { name: string; primaryColor: string };
}

// ─── tree builder ─────────────────────────────────────────────────────────────

function buildTree(folders: FolderFlat[], parentId: string | null = null): FolderNode[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .map((f) => ({ ...f, children: buildTree(folders, f.id) }));
}

// ─── sub-components ───────────────────────────────────────────────────────────

function FolderTree({
  nodes,
  depth = 0,
  selected,
  onSelect,
  brand,
}: {
  nodes: FolderNode[];
  depth?: number;
  selected: SelectedResource | null;
  onSelect: (r: SelectedResource) => void;
  brand: string;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isSelected = selected?.type === "folder" && selected.id === node.id;
        return (
          <div key={node.id}>
            <div
              onClick={() => onSelect({ type: "folder", id: node.id, name: node.name })}
              style={{
                paddingLeft: depth * 16 + 10,
                paddingTop: 6,
                paddingBottom: 6,
                paddingRight: 10,
                cursor: "pointer",
                borderRadius: 6,
                background: isSelected ? brand : "transparent",
                color: isSelected ? "#fff" : "#333",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <FileIcon isFolder size={15} />
              {node.name}
            </div>
            {node.children.length > 0 && (
              <FolderTree
                nodes={node.children}
                depth={depth + 1}
                selected={selected}
                onSelect={onSelect}
                brand={brand}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// Coloured badge for an access level.
function AccessBadge({ level }: { level: string | null }) {
  if (!level) return <span style={{ color: "#aaa" }}>—</span>;
  const colors: Record<string, { bg: string; fg: string }> = {
    MANAGE: { bg: "#ede9fe", fg: "#6d28d9" },
    EDIT:   { bg: "#dbeafe", fg: "#1d4ed8" },
    READ:   { bg: "#d1fae5", fg: "#065f46" },
    NONE:   { bg: "#f3f4f6", fg: "#6b7280" },
  };
  const c = colors[level] ?? { bg: "#f3f4f6", fg: "#6b7280" };
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {{ MANAGE: "Gestión total", EDIT: "Editar", READ: "Solo lectura", NONE: "Sin acceso" }[level] ?? level}
    </span>
  );
}

// Human-readable source label.
function SourceLabel({ source }: { source: string }) {
  if (source === "admin") return <span style={{ fontSize: 12, color: "#6d28d9" }}>Rol de admin</span>;
  if (source === "direct") return <span style={{ fontSize: 12, color: "#059669" }}>Permiso directo</span>;
  if (source === "none")   return <span style={{ fontSize: 12, color: "#aaa" }}>—</span>;
  // "folder:FolderName"
  const name = source.replace(/^folder:/, "");
  return <span style={{ fontSize: 12, color: "#d97706" }}>↑ Carpeta: {name}</span>;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PermissionsClient({ company }: Props) {
  const router = useRouter();
  const brand = company.primaryColor;

  const [folders, setFolders] = useState<FolderFlat[]>([]);
  const [files, setFiles] = useState<FileFlat[]>([]);
  const [selected, setSelected] = useState<SelectedResource | null>(null);
  const [entries, setEntries] = useState<PermEntry[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [saving, setSaving] = useState<string | null>(null); // userId being saved

  // ── fetch resource list on mount ─────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/admin/resources")
      .then((r) => r.json())
      .then((d) => {
        setFolders(d.folders ?? []);
        setFiles(d.files ?? []);
      })
      .finally(() => setLoadingResources(false));
  }, []);

  // ── fetch permissions when selection changes ──────────────────────────────────

  const fetchEntries = useCallback(async (resource: SelectedResource) => {
    setLoadingEntries(true);
    const param = resource.type === "folder"
      ? `folderId=${resource.id}`
      : `fileId=${resource.id}`;
    const res = await fetch(`/api/admin/permissions?${param}`);
    const data = await res.json();
    setEntries(data.entries ?? []);
    setLoadingEntries(false);
  }, []);

  function selectResource(resource: SelectedResource) {
    setSelected(resource);
    fetchEntries(resource);
  }

  // ── change a user's permission ────────────────────────────────────────────────

  async function setPermission(userId: string, accessLevel: string) {
    if (!selected) return;
    setSaving(userId);
    await fetch("/api/admin/permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        ...(selected.type === "folder"
          ? { folderId: selected.id }
          : { fileId: selected.id }),
        accessLevel,
      }),
    });
    await fetchEntries(selected);
    setSaving(null);
  }

  // ── render ────────────────────────────────────────────────────────────────────

  const tree = buildTree(folders);

  // Files grouped by folder for the sidebar
  const rootFiles = files.filter((f) => f.folderId === null);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f5f7fa" }}>
      {/* Section header */}
      <div style={{ background: brand, color: "#fff", padding: "12px 28px", flexShrink: 0 }}>
        <strong style={{ fontSize: 16 }}>Permisos</strong>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Left panel: resource selector ───────────────────────────────── */}
        <aside
          style={{
            width: 260,
            background: "#fff",
            borderRight: "1px solid #eee",
            overflowY: "auto",
            padding: 12,
            flexShrink: 0,
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Carpetas
          </p>

          {loadingResources ? (
            <p style={{ fontSize: 13, color: "#aaa" }}>Cargando…</p>
          ) : tree.length === 0 && rootFiles.length === 0 ? (
            <p style={{ fontSize: 13, color: "#aaa" }}>Sin recursos aún.</p>
          ) : (
            <FolderTree
              nodes={tree}
              selected={selected}
              onSelect={selectResource}
              brand={brand}
            />
          )}

          {files.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#999",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginTop: 14,
                  marginBottom: 6,
                }}
              >
                Archivos
              </p>
              {files.map((file) => {
                const isSelected = selected?.type === "file" && selected.id === file.id;
                return (
                  <div
                    key={file.id}
                    onClick={() =>
                      selectResource({ type: "file", id: file.id, name: file.name })
                    }
                    style={{
                      padding: "6px 10px",
                      cursor: "pointer",
                      borderRadius: 6,
                      background: isSelected ? brand : "transparent",
                      color: isSelected ? "#fff" : "#333",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <FileIcon mimeType={file.mimeType} size={15} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </aside>

        {/* ── Right panel: permissions table ──────────────────────────────── */}
        <section style={{ flex: 1, overflowY: "auto", padding: 28 }}>
          {!selected ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#aaa",
              }}
            >
              <p style={{ marginTop: 12 }}>Selecciona una carpeta o archivo para gestionar sus permisos.</p>
            </div>
          ) : (
            <>
              <h2 style={{ marginTop: 0, color: "#1F3A5F", fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                {selected.type === "folder"
                  ? <FileIcon isFolder size={20} />
                  : <FileIcon mimeType={files.find((f) => f.id === selected.id)?.mimeType ?? ""} size={20} />
                }
                {selected.name}
              </h2>

              {/* Legend */}
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 16px", marginBottom: 20, fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                <strong style={{ color: "#374151" }}>Cómo funcionan los permisos:</strong> cada usuario tiene un{" "}
                <strong>rol base</strong> (EDITOR, VIEWER, etc.) que aplica a todo. Puedes añadir un{" "}
                <strong>permiso explícito</strong> en esta carpeta/archivo para sobrescribir ese rol.
                Si eliges <em>Heredar</em>, se elimina el permiso explícito y el acceso se hereda del rol base o carpeta padre.
              </div>

              {loadingEntries ? (
                <p style={{ color: "#aaa" }}>Cargando…</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #eee" }}>
                      {["Usuario", "Rol base", "Permiso explícito", "Acceso efectivo", "Origen", "Asignar acceso"].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              padding: "8px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#666",
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                            }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const isAdmin = entry.user.role === "COMPANY_ADMIN";
                      const isSaving = saving === entry.user.id;
                      // Dropdown current value: explicit level if set, else "INHERIT"
                      const currentValue = entry.explicit ?? "INHERIT";

                      return (
                        <tr
                          key={entry.user.id}
                          style={{
                            borderBottom: "1px solid #f3f4f6",
                            background: isSaving ? "#fffbeb" : "transparent",
                          }}
                        >
                          {/* User */}
                          <td style={styles.td}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                              {entry.user.name}
                            </div>
                            <div style={{ fontSize: 12, color: "#888" }}>
                              {entry.user.email}
                            </div>
                          </td>

                          {/* Role badge */}
                          <td style={styles.td}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: 4,
                                background:
                                  entry.user.role === "COMPANY_ADMIN"
                                    ? "#faf5ff"
                                    : entry.user.role === "EDITOR"
                                    ? "#eff6ff"
                                    : "#f0fdf4",
                                color:
                                  entry.user.role === "COMPANY_ADMIN"
                                    ? "#7c3aed"
                                    : entry.user.role === "EDITOR"
                                    ? "#1d4ed8"
                                    : "#15803d",
                              }}
                            >
                              {entry.user.role}
                            </span>
                          </td>

                          {/* Explicit */}
                          <td style={styles.td}>
                            <AccessBadge level={entry.explicit} />
                          </td>

                          {/* Effective */}
                          <td style={styles.td}>
                            <AccessBadge level={entry.effective} />
                          </td>

                          {/* Source */}
                          <td style={styles.td}>
                            <SourceLabel source={entry.source} />
                          </td>

                          {/* Set access dropdown */}
                          <td style={styles.td}>
                            {isAdmin ? (
                              <span style={{ fontSize: 12, color: "#aaa" }}>
                                Siempre MANAGE
                              </span>
                            ) : (
                              <select
                                value={currentValue}
                                disabled={isSaving}
                                onChange={(e) =>
                                  setPermission(entry.user.id, e.target.value)
                                }
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  border: "1px solid #ddd",
                                  fontSize: 13,
                                  cursor: "pointer",
                                  opacity: isSaving ? 0.5 : 1,
                                  background: "#fff",
                                }}
                              >
                                <option value="INHERIT">— Heredar del rol base</option>
                                <option value="NONE">Sin acceso</option>
                                <option value="READ">Solo lectura</option>
                                <option value="EDIT">Editar</option>
                                <option value="MANAGE">Gestión total</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = {
  headerBtn: {
    background: "rgba(255,255,255,0.2)",
    border: "none",
    color: "#fff",
    padding: "6px 14px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  } as React.CSSProperties,
  td: {
    padding: "10px 12px",
    verticalAlign: "middle",
  } as React.CSSProperties,
};
