"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, CheckCircle, Search, X } from "lucide-react";
import FileIcon from "@/components/FileIcon";

interface DocOption {
  id: string; name: string; nombreDocumento: string | null;
  codigo: string | null; versionStr: string | null; mimeType: string;
  status: string; folder: { id: string; name: string } | null;
}

interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string; logoUrl: string | null };
}

export default function EliminarDocumentoClient({ company }: Props) {
  const p = company.primaryColor;
  const router = useRouter();
  const t  = useTranslations("eliminar");
  const tc = useTranslations("common");

  const [docs,        setDocs]        = useState<DocOption[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [selected,    setSelected]    = useState<DocOption | null>(null);
  const [motivo,      setMotivo]      = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);

  useEffect(() => {
    fetch("/api/files/user-docs")
      .then((r) => r.json())
      .then((d) => setDocs(d.files ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = docs.filter((d) => {
    const q = search.toLowerCase();
    return (d.nombreDocumento ?? d.name).toLowerCase().includes(q) || (d.codigo ?? "").toLowerCase().includes(q);
  });

  async function submit() {
    if (!selected) { setError(t("step1")); return; }
    setSubmitting(true); setError(null);
    const res = await fetch(`/api/files/${selected.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (res.status === 202 && data.requiresApproval) {
      setSuccess(true);
    } else if (res.ok) {
      setSuccess(true);
    } else if (res.status === 403) {
      setError(t("noPermission"));
    } else {
      setError(data.error ?? t("step1"));
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f8fafc", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      <style>{`
        .form-input { width: 100%; padding: 10px 13px; border: 1px solid #d1d5db; border-radius: 9px; font-size: 14px; outline: none; box-sizing: border-box; }
        .form-input:focus { border-color: ${p}; box-shadow: 0 0 0 3px ${p}22; }
        .doc-row { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 12px; transition: background 0.12s; }
        .doc-row:hover { background: #f8fafc; }
        .doc-row.selected { background: #eff6ff; }
        .btn { border: none; cursor: pointer; padding: 11px 22px; border-radius: 9px; font-size: 14px; font-weight: 700; transition: opacity 0.15s; }
        .btn:hover { opacity: 0.85; } .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      {/* Header */}
      <div style={{ background: p, color: "#fff", padding: "20px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Trash2 size={20} />
          <strong style={{ fontSize: 17 }}>{t("header")}</strong>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.8 }}>
          {t("headerDesc")}
        </p>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px" }}>

        {success ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <CheckCircle size={56} color="#22c55e" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
              {t("successTitle")}
            </div>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 28 }}>
              {t("successMsg")}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="btn" onClick={() => { setSuccess(false); setSelected(null); setMotivo(""); }} style={{ background: "#f1f5f9", color: "#475569" }}>
                {t("newRequest")}
              </button>
              <button className="btn" onClick={() => router.push("/dashboard/pendientes")} style={{ background: p, color: "#fff" }}>
                {t("viewPendientes")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Step 1: Select document */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px", marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                {t("step1")}
              </h3>

              {selected ? (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <FileIcon mimeType={selected.mimeType} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{selected.nombreDocumento || selected.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      {selected.codigo && <span>Código: <b>{selected.codigo}</b> · </span>}
                      {selected.versionStr && <span>Versión: <b>{selected.versionStr}</b> · </span>}
                      {selected.folder && <span>Carpeta: {selected.folder.name}</span>}
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}>
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ position: "relative", marginBottom: 10 }}>
                    <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                    <input
                      className="form-input"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("searchPlaceholder")}
                      style={{ paddingLeft: 36 }}
                    />
                  </div>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 9, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
                    {loading ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{tc("loading")}</div>
                    ) : filtered.length === 0 ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                        {docs.length === 0 ? t("emptyDocs") : t("emptySearch")}
                      </div>
                    ) : filtered.map((doc) => (
                      <div
                        key={doc.id}
                        className="doc-row"
                        onClick={() => { setSelected(doc); setSearch(""); }}
                      >
                        <FileIcon mimeType={doc.mimeType} size={24} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {doc.nombreDocumento || doc.name}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            {doc.codigo && `${doc.codigo} · `}{doc.versionStr && `v${doc.versionStr}`}
                            {doc.folder && ` · ${doc.folder.name}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Step 2: Reason (optional) */}
            {selected && (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px", marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                  {t("step2")}
                </h3>
                <textarea
                  className="form-input"
                  rows={4}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  style={{ resize: "vertical" }}
                />
              </div>
            )}

            {/* Warning */}
            {selected && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#92400e" }}>
                {t("warning")}
              </div>
            )}

            {error && (
              <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 9, padding: "11px 14px", marginBottom: 16, fontSize: 13, color: "#be123c" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={() => router.push("/dashboard")} style={{ background: "#f1f5f9", color: "#475569" }}>
                {tc("cancel")}
              </button>
              <button
                className="btn"
                disabled={!selected || submitting}
                onClick={submit}
                style={{ background: "#dc2626", color: "#fff" }}
              >
                {submitting ? t("submitting") : <><Trash2 size={14} style={{ marginRight: 6 }} />{t("submitBtn")}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
