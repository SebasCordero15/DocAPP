"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import FileIcon from "@/components/FileIcon";

// ─── types ────────────────────────────────────────────────────────────────────

interface FolderFlat {
  id: string;
  name: string;
  parentId: string | null;
  isExternal: boolean;
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

// Coloured badge for an access level (label must already be translated).
function AccessBadge({ level, label }: { level: string | null; label: string }) {
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
      {label}
    </span>
  );
}

// Short human-readable explanation of *why* the user has this effective access.
// Returns null when no extra context is needed (admins, or no access at all).
function accessCaption(entry: PermEntry, t: (key: string, values?: Record<string, string>) => string): string | null {
  if (entry.user.role === "COMPANY_ADMIN") return null;
  if (entry.source === "direct") return t("captions.direct");
  if (entry.source.startsWith("folder:")) return t("captions.folder", { name: entry.source.replace(/^folder:/, "") });
  if (entry.source === "none" && entry.effective !== "NONE") return t("captions.role");
  return null;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PermissionsClient({ company }: Props) {
  const router = useRouter();
  const brand = company.primaryColor;
  const t  = useTranslations("permisos");
  const tc = useTranslations("common");

  const [folders, setFolders] = useState<FolderFlat[]>([]);
  const [files, setFiles] = useState<FileFlat[]>([]);
  const [selected, setSelected] = useState<SelectedResource | null>(null);
  const [entries, setEntries] = useState<PermEntry[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [saving, setSaving] = useState<string | null>(null); // userId being saved
  const [permTab, setPermTab] = useState<"normal" | "external">("normal");

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

  const normalFolders  = folders.filter((f) => !f.isExternal);
  const externalFolders = folders.filter((f) => f.isExternal);

  const activeFolders  = permTab === "normal" ? normalFolders : externalFolders;
  const tree           = buildTree(activeFolders);

  // External folder IDs for filtering files
  const externalFolderIds = new Set(externalFolders.map((f) => f.id));
  const normalFiles   = files.filter((f) => !f.folderId || !externalFolderIds.has(f.folderId));
  const externalFiles = files.filter((f) => f.folderId && externalFolderIds.has(f.folderId));
  const activeFiles   = permTab === "normal" ? normalFiles : externalFiles;
  const rootFiles     = activeFiles.filter((f) => f.folderId === null);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f5f7fa" }}>
      {/* Section header */}
      <div style={{ background: brand, color: "#fff", padding: "12px 28px", flexShrink: 0 }}>
        <strong style={{ fontSize: 16 }}>{t("header")}</strong>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Left panel: resource selector ───────────────────────────────── */}
        <aside
          style={{
            width: 260,
            background: "#fff",
            borderRight: "1px solid #eee",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          {/* Tab toggle */}
          <div style={{ display: "flex", borderBottom: "1px solid #eee", flexShrink: 0 }}>
            {(["normal", "external"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setPermTab(tab); setSelected(null); }}
                style={{
                  flex: 1, padding: "10px 6px", border: "none", background: "transparent",
                  cursor: "pointer", fontSize: 12, fontWeight: permTab === tab ? 700 : 400,
                  color: permTab === tab ? brand : "#94a3b8",
                  borderBottom: `2px solid ${permTab === tab ? brand : "transparent"}`,
                  transition: "all 0.15s",
                }}
              >
                {tab === "normal" ? t("tabs.docs") : t("tabs.externos")}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              {t("foldersLabel")}
            </p>

            {loadingResources ? (
              <p style={{ fontSize: 13, color: "#aaa" }}>{tc("loading")}</p>
            ) : tree.length === 0 && rootFiles.length === 0 ? (
              <p style={{ fontSize: 13, color: "#aaa" }}>{t("emptyResources")}</p>
            ) : (
              <FolderTree
                nodes={tree}
                selected={selected}
                onSelect={selectResource}
                brand={brand}
              />
            )}

            {activeFiles.length > 0 && (
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
                  {t("filesLabel")}
                </p>
                {activeFiles.map((file) => {
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
          </div>
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
              <p style={{ marginTop: 12 }}>{t("selectPrompt")}</p>
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
                <strong style={{ color: "#374151" }}>{t("legend.heading")}</strong> {t("legend.body")}
              </div>

              {loadingEntries ? (
                <p style={{ color: "#aaa" }}>{tc("loading")}</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #eee" }}>
                      {[
                        t("cols.user"),
                        t("cols.rolBase"),
                        t("cols.access", { resource: selected.type === "folder" ? t("resourceNoun.folder") : t("resourceNoun.file") }),
                        t("cols.assign"),
                      ].map(
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

                          {/* Access on this resource (badge + short explanation) */}
                          <td style={styles.td}>
                            <AccessBadge level={entry.effective} label={t(`levels.${entry.effective}`)} />
                            {accessCaption(entry, t) && (
                              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                                {accessCaption(entry, t)}
                              </div>
                            )}
                          </td>

                          {/* Set access dropdown */}
                          <td style={styles.td}>
                            {isAdmin ? (
                              <span style={{ fontSize: 12, color: "#aaa" }}>
                                {t("levels.alwaysManage")}
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
                                <option value="INHERIT">{t("options.inherit")}</option>
                                <option value="NONE">{t("options.NONE")}</option>
                                <option value="READ">{t("options.READ")}</option>
                                <option value="EDIT">{t("options.EDIT")}</option>
                                <option value="MANAGE">{t("options.MANAGE")}</option>
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
