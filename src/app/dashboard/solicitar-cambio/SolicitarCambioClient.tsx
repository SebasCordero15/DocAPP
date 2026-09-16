"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle, Search, X, Paperclip, Loader2 } from "lucide-react";
import FileIcon from "@/components/FileIcon";

interface DocOption {
  id: string; name: string; nombreDocumento: string | null;
  codigo: string | null; versionStr: string | null; mimeType: string;
  status: string; folder: { id: string; name: string } | null;
}

type TipoCambio = "REVISION" | "ACTUALIZACION" | "CORRECCION";

interface Props {
  company: { name: string; primaryColor: string; accentColor: string; fontFamily: string; logoUrl: string | null };
}


export default function SolicitarCambioClient({ company }: Props) {
  const p = company.primaryColor;
  const router = useRouter();
  const t  = useTranslations("solicitar");
  const tc = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const TIPO_LABELS: Record<TipoCambio, string> = {
    REVISION:      t("types.REVISION"),
    ACTUALIZACION: t("types.ACTUALIZACION"),
    CORRECCION:    t("types.CORRECCION"),
  };
  const TIPO_DESC: Record<TipoCambio, string> = {
    REVISION:      t("typeDescs.REVISION"),
    ACTUALIZACION: t("typeDescs.ACTUALIZACION"),
    CORRECCION:    t("typeDescs.CORRECCION"),
  };

  const [docs,        setDocs]        = useState<DocOption[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [selected,    setSelected]    = useState<DocOption | null>(null);
  const [tipo,        setTipo]        = useState<TipoCambio>("REVISION");
  const [motivo,      setMotivo]      = useState("");
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [uploading,   setUploading]   = useState(false);
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
    if (!selected) { setError(t("errors.noDoc")); return; }
    if (!motivo.trim()) { setError(t("errors.noMotivo")); return; }
    setSubmitting(true); setError(null);

    let proposalStorageKey: string | null = null;
    let proposalFileName:   string | null = null;

    if (proposalFile) {
      setUploading(true);
      const urlRes = await fetch("/api/change-requests/proposal-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: selected.id, name: proposalFile.name, mimeType: proposalFile.type || "application/octet-stream", size: proposalFile.size }),
      });
      if (!urlRes.ok) {
        const d = await urlRes.json().catch(() => ({}));
        setError(d.error ?? t("errors.uploadUrl"));
        setSubmitting(false); setUploading(false); return;
      }
      const { uploadUrl, storageKey } = await urlRes.json();
      const upRes = await fetch(uploadUrl, { method: "PUT", body: proposalFile, headers: { "Content-Type": proposalFile.type || "application/octet-stream" } });
      setUploading(false);
      if (!upRes.ok) { setError(t("errors.uploadFile")); setSubmitting(false); return; }
      proposalStorageKey = storageKey;
      proposalFileName   = proposalFile.name;
    }

    const res = await fetch("/api/change-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId: selected.id, tipo, motivo: motivo.trim(),
        proposalStorageKey, proposalFileName,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (res.status === 202 || res.ok) {
      setSuccess(true);
    } else if (res.status === 403) {
      setError(data.error ?? t("errors.noPermission"));
    } else {
      setError(data.error ?? t("errors.generic"));
    }
  }

  const tipoOptions: TipoCambio[] = ["REVISION", "ACTUALIZACION", "CORRECCION"];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f8fafc", fontFamily: `'${company.fontFamily}', Inter, system-ui, sans-serif` }}>
      <style>{`
        .form-input { width: 100%; padding: 10px 13px; border: 1px solid #d1d5db; border-radius: 9px; font-size: 14px; outline: none; box-sizing: border-box; }
        .form-input:focus { border-color: ${p}; box-shadow: 0 0 0 3px ${p}22; }
        .doc-row { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 12px; transition: background 0.12s; }
        .doc-row:hover { background: #f8fafc; }
        .tipo-pill { padding: 10px 16px; border-radius: 9px; border: 2px solid #e2e8f0; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; background: #fff; text-align: left; }
        .tipo-pill:hover { border-color: #cbd5e1; }
        .tipo-pill.active { border-color: ${p}; background: #eff6ff; color: ${p}; }
        .btn { border: none; cursor: pointer; padding: 11px 22px; border-radius: 9px; font-size: 14px; font-weight: 700; transition: opacity 0.15s; }
        .btn:hover { opacity: 0.85; } .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      {/* Header */}
      <div style={{ background: p, color: "#fff", padding: "20px 32px" }}>
        <strong style={{ fontSize: 17 }}>{t("header")}</strong>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.8 }}>
          {t("headerDesc")}
        </p>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 24px" }}>

        {success ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <CheckCircle size={56} color="#22c55e" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>{t("successTitle")}</div>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 28 }}>
              {t("successMsg")}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="btn" onClick={() => { setSuccess(false); setSelected(null); setMotivo(""); setProposalFile(null); }} style={{ background: "#f1f5f9", color: "#475569" }}>
                {t("newRequest")}
              </button>
              <button className="btn" onClick={() => router.push("/dashboard/pendientes")} style={{ background: p, color: "#fff" }}>
                {t("viewPendientes")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Step 1: Document */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px", marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{t("step1")}</h3>
              {selected ? (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <FileIcon mimeType={selected.mimeType} size={26} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{selected.nombreDocumento || selected.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        {selected.codigo && <span>{tc("codigo")}: <b>{selected.codigo}</b> · </span>}
                        {selected.versionStr && <span>{tc("version")}: <b>{selected.versionStr}</b> · </span>}
                        {selected.folder && <span>{tc("carpeta")}: {selected.folder.name}</span>}
                      </div>
                    </div>
                    <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}>
                      <X size={16} />
                    </button>
                  </div>
                  {/* Readonly fields */}
                  <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                    {[
                      { label: t("confirmLabels.nombre"), value: selected.nombreDocumento || selected.name },
                      { label: t("confirmLabels.codigo"), value: selected.codigo ?? "—" },
                      { label: t("confirmLabels.version"), value: selected.versionStr ?? "—" },
                    ].map((f) => (
                      <div key={f.label} style={{ background: "#f1f5f9", borderRadius: 7, padding: "7px 12px", minWidth: 110 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 }}>{f.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{f.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ position: "relative", marginBottom: 10 }}>
                    <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                    <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} style={{ paddingLeft: 36 }} />
                  </div>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 9, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
                    {loading ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{t("loadingDocs")}</div>
                    ) : filtered.length === 0 ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                        {docs.length === 0 ? t("emptyDocs") : t("emptySearch")}
                      </div>
                    ) : filtered.map((doc) => (
                      <div key={doc.id} className="doc-row" onClick={() => { setSelected(doc); setSearch(""); }}>
                        <FileIcon mimeType={doc.mimeType} size={24} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.nombreDocumento || doc.name}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{doc.codigo && `${doc.codigo} · `}{doc.versionStr && `v${doc.versionStr}`}{doc.folder && ` · ${doc.folder.name}`}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {selected && (
              <>
                {/* Step 2: Type */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px", marginBottom: 20 }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{t("step2")}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {tipoOptions.map((opt) => (
                      <button key={opt} className={`tipo-pill${tipo === opt ? " active" : ""}`} onClick={() => setTipo(opt)}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{TIPO_LABELS[opt]}</div>
                        <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 400 }}>{TIPO_DESC[opt]}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 3: Reason */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px", marginBottom: 20 }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                    {t("step3")} <span style={{ color: "#dc2626" }}>*</span>
                  </h3>
                  <textarea
                    className="form-input"
                    rows={5}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder={t("motivoPlaceholder")}
                    style={{ resize: "vertical" }}
                  />
                </div>

                {/* Step 4: Optional file */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px", marginBottom: 24 }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                    {t("step4")} <span style={{ fontSize: 12, fontWeight: 400, color: "#94a3b8" }}>{t("step4Optional")}</span>
                  </h3>
                  <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748b" }}>
                    {t("step4Desc")}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    onChange={(e) => setProposalFile(e.target.files?.[0] ?? null)}
                  />
                  {proposalFile ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 9, padding: "10px 14px" }}>
                      <Paperclip size={16} color="#16a34a" />
                      <span style={{ fontSize: 13, color: "#166534", fontWeight: 600, flex: 1 }}>{proposalFile.name}</span>
                      <button onClick={() => { setProposalFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "1px dashed #d1d5db", borderRadius: 9, padding: "10px 16px", cursor: "pointer", color: "#64748b", fontSize: 13, fontWeight: 600 }}
                    >
                      <Paperclip size={15} /> {t("attachFile")}
                    </button>
                  )}
                </div>
              </>
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
                disabled={!selected || !motivo.trim() || submitting}
                onClick={submit}
                style={{ background: p, color: "#fff" }}
              >
                {submitting ? (
                  <><Loader2 size={14} style={{ marginRight: 6, animation: "spin 1s linear infinite" }} />{uploading ? t("uploading") : t("submitting")}</>
                ) : t("submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
