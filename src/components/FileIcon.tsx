import {
  Folder,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  File,
} from "lucide-react";

interface Props {
  mimeType?: string;
  isFolder?: boolean;
  size?: number;
  color?: string;
}

function resolveIcon(mimeType: string) {
  // PDF
  if (mimeType === "application/pdf") return FileText;

  // Spreadsheets
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv" ||
    mimeType === "application/csv"
  ) return FileSpreadsheet;

  // Word / rich text
  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/rtf" ||
    mimeType === "text/plain"
  ) return FileText;

  // Images
  if (mimeType.startsWith("image/")) return FileImage;

  // Video
  if (mimeType.startsWith("video/")) return FileVideo;

  // Audio
  if (mimeType.startsWith("audio/")) return FileAudio;

  // Code / markup
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/javascript"
  ) return FileCode;

  // Archives
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-tar" ||
    mimeType === "application/gzip" ||
    mimeType === "application/x-7z-compressed" ||
    mimeType === "application/x-rar-compressed"
  ) return FileArchive;

  return File;
}

function resolveColor(mimeType: string): string {
  if (mimeType === "application/pdf") return "#e53e3e";

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv" ||
    mimeType === "application/csv"
  ) return "#16a34a";

  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) return "#2563eb";

  if (mimeType.startsWith("image/")) return "#7c3aed";
  if (mimeType.startsWith("video/")) return "#db2777";
  if (mimeType.startsWith("audio/")) return "#d97706";

  return "#64748b";
}

export default function FileIcon({ mimeType = "", isFolder = false, size = 18, color }: Props) {
  if (isFolder) {
    return <Folder size={size} color={color ?? "#f59e0b"} fill={color ?? "#fbbf24"} strokeWidth={1.5} />;
  }
  const Icon = resolveIcon(mimeType);
  return <Icon size={size} color={color ?? resolveColor(mimeType)} strokeWidth={1.5} />;
}
