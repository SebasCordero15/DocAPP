"use client";

import { useState, useEffect } from "react";
import { X, Download } from "lucide-react";
import FileIcon from "./FileIcon";

const SPREADSHEET_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]);
const WORD_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

export function isSpreadsheet(m: string) { return SPREADSHEET_TYPES.has(m); }
export function isWord(m: string) { return WORD_TYPES.has(m); }
export function isViewable(m: string) { return m === "application/pdf" || isSpreadsheet(m) || isWord(m); }

export interface ViewableFile {
  id: string;
  name: string;
  mimeType: string;
}

interface Props {
  file: ViewableFile | null;
  onClose: () => void;
  brand?: string;
}

export default function FileViewerModal({ file, onClose, brand = "#2563eb" }: Props) {
  const [pdfUrl,        setPdfUrl]        = useState<string | null>(null);
  const [pdfLoading,    setPdfLoading]    = useState(false);
  const [sheets,        setSheets]        = useState<{ name: string; html: string }[]>([]);
  const [activeTab,     setActiveTab]     = useState(0);
  const [officeLoading, setOfficeLoading] = useState(false);
  const [downloadUrl,   setDownloadUrl]   = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    setPdfUrl(null);
    setSheets([]);
    setActiveTab(0);
    setDownloadUrl(null);

    if (file.mimeType === "application/pdf") {
      setPdfLoading(true);
      fetch(`/api/files/${file.id}/view-url`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setPdfUrl(d.url); })
        .finally(() => setPdfLoading(false));
    } else if (isSpreadsheet(file.mimeType) || isWord(file.mimeType)) {
      setOfficeLoading(true);
      const endpoint = isWord(file.mimeType) ? "word-html" : "excel-html";
      Promise.all([
        fetch(`/api/files/${file.id}/${endpoint}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/files/${file.id}/download-url`).then((r) => (r.ok ? r.json() : null)),
      ]).then(([content, dl]) => {
        if (content) {
          setSheets(
            isWord(file.mimeType)
              ? [{ name: "Documento", html: content.html ?? "" }]
              : (content.sheets ?? [])
          );
        }
        if (dl) setDownloadUrl(dl.url);
      }).finally(() => setOfficeLoading(false));
    }
  }, [file?.id]);

  if (!file) return null;

  function handleDownload() {
    if (downloadUrl) { window.open(downloadUrl, "_blank"); return; }
    fetch(`/api/files/${file!.id}/download-url`)
      .then((r) => r.json())
      .then((d) => window.open(d.url, "_blank"));
  }

  // ── PDF viewer ───────────────────────────────────────────────────────────────
  if (file.mimeType === "application/pdf") {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#1e293b", color: "#fff", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{file.name}</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={handleDownload}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <Download size={13} /> Descargar
            </button>
            <button onClick={onClose}
              style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "5px 10px", borderRadius: 6, cursor: "pointer", display: "flex" }}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          {pdfLoading ? (
            <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#fff" }}>Cargando PDF…</div>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} style={{ width: "100%", height: "100%", border: "none" }} title={file.name} />
          ) : (
            <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#94a3b8" }}>No se pudo cargar el PDF.</div>
          )}
        </div>
      </div>
    );
  }

  // ── Excel / Word viewer ──────────────────────────────────────────────────────
  if (isSpreadsheet(file.mimeType) || isWord(file.mimeType)) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#1e293b", color: "#fff", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <FileIcon mimeType={file.mimeType} size={16} />
            <span style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <button onClick={handleDownload}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
              <Download size={13} /> Descargar
            </button>
            <button onClick={onClose}
              style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "5px 10px", borderRadius: 6, cursor: "pointer", display: "flex" }}>
              <X size={16} />
            </button>
          </div>
        </div>
        {sheets.length > 1 && !isWord(file.mimeType) && (
          <div style={{ background: "#0f172a", display: "flex", gap: 2, padding: "0 20px", flexShrink: 0 }}>
            {sheets.map((s, i) => (
              <button key={i} onClick={() => setActiveTab(i)}
                style={{ padding: "7px 14px", fontSize: 12, fontWeight: activeTab === i ? 700 : 400, background: activeTab === i ? "#fff" : "transparent", color: activeTab === i ? "#1e293b" : "rgba(255,255,255,0.6)", border: "none", borderRadius: "6px 6px 0 0", cursor: "pointer" }}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1, overflow: "auto", background: "#f8fafc" }}>
          {officeLoading ? (
            <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#475569", fontSize: 14 }}>Cargando documento…</div>
          ) : sheets.length > 0 ? (
            <div style={{ padding: isWord(file.mimeType) ? "32px 60px" : "16px 20px", maxWidth: isWord(file.mimeType) ? 860 : undefined, margin: "0 auto", background: "#fff", minHeight: "100%" }}>
              <style>{`
                .fvm-xlsx table { border-collapse: collapse; font-size: 12.5px; white-space: nowrap; }
                .fvm-xlsx td, .fvm-xlsx th { border: 1px solid #d1d5db; padding: 5px 12px; }
                .fvm-xlsx tr:first-child td, .fvm-xlsx tr:first-child th { background: #f1f5f9; font-weight: 700; }
                .fvm-xlsx tr:nth-child(even) td { background: #f8fafc; }
                .fvm-word { font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.8; color: #1e293b; }
                .fvm-word h1 { font-size: 22px; font-weight: 700; margin: 0 0 16px; }
                .fvm-word h2 { font-size: 17px; font-weight: 700; margin: 20px 0 8px; }
                .fvm-word h3 { font-size: 15px; font-weight: 600; margin: 16px 0 6px; }
                .fvm-word p  { margin: 0 0 10px; }
                .fvm-word table { border-collapse: collapse; width: 100%; margin: 12px 0; }
                .fvm-word td, .fvm-word th { border: 1px solid #d1d5db; padding: 6px 10px; }
                .fvm-word ul, .fvm-word ol { margin: 0 0 10px; padding-left: 24px; }
              `}</style>
              <div className={isWord(file.mimeType) ? "fvm-word" : "fvm-xlsx"}
                dangerouslySetInnerHTML={{ __html: sheets[activeTab]?.html ?? "" }} />
            </div>
          ) : (
            <div style={{ padding: "60px 40px", textAlign: "center", color: "#475569" }}>
              <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 16, color: "#1e293b" }}>No se puede previsualizar este archivo.</p>
              <p style={{ margin: "0 0 24px", fontSize: 13 }}>Descarga el archivo para abrirlo en tu aplicación.</p>
              <button onClick={handleDownload}
                style={{ background: brand, color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Download size={14} /> Descargar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
