"use client";

import React from "react";
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  Eye,
} from "lucide-react";

export interface FilePreviewAttachment {
  name: string;
  mimeType: string;
  sizeBytes: number;
  signedUrl: string;
  attachmentId?: string;
}

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: FilePreviewAttachment;
  onDownload: (url: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PreviewLoading({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-neutral-900 text-neutral-400">
      <Loader2 className="h-6 w-6 animate-spin text-neutral-500" style={{ color: "#737373" }} />
      <p className="text-xs font-medium" style={{ color: "#A3A3A3" }}>{label}</p>
    </div>
  );
}

function PreviewError({ onRetry, onDownload }: { onRetry?: () => void; onDownload?: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-neutral-900 px-8 text-neutral-300">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20" style={{ backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.2)" }}>
        <AlertTriangle className="h-6 w-6 text-amber-500" style={{ color: "#F59E0B" }} />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-neutral-200" style={{ color: "#E5E5E5" }}>Could not load preview</p>
        <p className="text-xs max-w-xs text-neutral-400" style={{ color: "#A3A3A3" }}>
          The file could not be rendered. You can download the original to view it.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ color: "#D4D4D4", borderColor: "#404040" }}
          >
            <Eye className="h-3.5 w-3.5" style={{ color: "#D4D4D4" }} />
            Retry
          </button>
        )}
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ backgroundColor: "#DC2626", color: "#FFFFFF" }}
          >
            <Download className="h-3.5 w-3.5" style={{ color: "#FFFFFF" }} />
            Download Original
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Image preview (Stateless) ──────────────────────────────────────────────

function ImagePreview({
  src,
  name,
  scale,
  rotation,
  position,
  isDragging,
}: {
  src: string;
  name: string;
  scale: number;
  rotation: number;
  position: { x: number; y: number };
  isDragging: boolean;
}) {
  return (
    <div className="flex-1 overflow-hidden flex items-center justify-center select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        className="max-w-full max-h-full object-contain select-none"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
          transition: isDragging ? "none" : "transform 0.15s ease-out",
          pointerEvents: scale > 1 ? "none" : "auto",
        }}
        draggable={false}
      />
    </div>
  );
}

// ─── PDF preview via cross-origin iframe ─────────────────────────────────────

function PdfPreview({ src, onDownload }: { src: string; onDownload: () => void }) {
  const [loadError, setLoadError] = React.useState(false);

  if (loadError) {
    return <PreviewError onRetry={() => setLoadError(false)} onDownload={onDownload} />;
  }

  return (
    <iframe
      src={src}
      className="flex-1 w-full border-0 bg-white"
      title="PDF preview"
      onError={() => setLoadError(true)}
    />
  );
}

// ─── DOCX preview via server-converted HTML ──────────────────────────────────

function DocxPreview({ attachmentId, onDownload }: { attachmentId: string; onDownload: () => void }) {
  const [html, setHtml] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const fetchPreview = React.useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/messaging/attachments/${attachmentId}/preview`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch preview");
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (json?.data?.kind === "html" && json.data.html) {
          setHtml(json.data.html);
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  React.useEffect(() => {
    return fetchPreview();
  }, [fetchPreview]);

  if (loading) return <PreviewLoading label="Converting document…" />;
  if (error || !html) return <PreviewError onRetry={fetchPreview} onDownload={onDownload} />;

  return (
    <div className="flex-1 overflow-auto bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        .docx-preview-wrapper {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1F2937;
          line-height: 1.6;
          font-size: 15px;
        }
        .docx-preview-wrapper h1,
        .docx-preview-wrapper h2,
        .docx-preview-wrapper h3,
        .docx-preview-wrapper h4,
        .docx-preview-wrapper h5,
        .docx-preview-wrapper h6 {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #111827;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          line-height: 1.25;
        }
        .docx-preview-wrapper h1 { font-size: 1.75rem; text-align: center; margin-bottom: 1.25rem; }
        .docx-preview-wrapper h2 { font-size: 1.35rem; margin-top: 1.75rem; padding-bottom: 0.25rem; border-bottom: 1px solid #E5E7EB; }
        .docx-preview-wrapper h3 { font-size: 1.15rem; }
        .docx-preview-wrapper p {
          margin-top: 0;
          margin-bottom: 1rem;
          color: #374151;
        }
        .docx-preview-wrapper ul,
        .docx-preview-wrapper ol {
          margin-top: 0;
          margin-bottom: 1rem;
          padding-left: 1.5rem;
        }
        .docx-preview-wrapper li {
          margin-bottom: 0.4rem;
          color: #374151;
        }
        .docx-preview-wrapper table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .docx-preview-wrapper th,
        .docx-preview-wrapper td {
          border: 1px solid #E5E7EB;
          padding: 10px 14px;
          text-align: left;
          font-size: 14px;
        }
        .docx-preview-wrapper th {
          background-color: #F9FAFB;
          font-weight: 600;
          color: #111827;
        }
        .docx-preview-wrapper tr:nth-child(even) {
          background-color: #F9FAFB;
        }
      `}} />
      <div
        className="mx-auto max-w-3xl p-12 docx-preview-wrapper"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ─── XLSX preview via server-converted HTML ──────────────────────────────────

function XlsxPreview({ attachmentId, onDownload }: { attachmentId: string; onDownload: () => void }) {
  const [html, setHtml] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const fetchPreview = React.useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/messaging/attachments/${attachmentId}/preview`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch preview");
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (json?.data?.kind === "html" && json.data.html) {
          setHtml(json.data.html);
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  React.useEffect(() => {
    return fetchPreview();
  }, [fetchPreview]);

  if (loading) return <PreviewLoading label="Loading spreadsheet…" />;
  if (error || !html) return <PreviewError onRetry={fetchPreview} onDownload={onDownload} />;

  return (
    <div className="flex-1 overflow-auto bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        .xlsx-preview-wrapper {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1F2937;
          padding: 24px;
        }
        .xlsx-preview-wrapper table {
          border-collapse: collapse;
          width: 100%;
          font-size: 13px;
          border: 1px solid #D1D5DB;
        }
        .xlsx-preview-wrapper th,
        .xlsx-preview-wrapper td {
          border: 1px solid #E5E7EB;
          padding: 8px 12px;
          text-align: left;
          min-width: 100px;
        }
        .xlsx-preview-wrapper th {
          background-color: #F3F4F6;
          font-weight: 600;
          color: #111827;
          border: 1px solid #D1D5DB;
        }
        .xlsx-preview-wrapper tr:nth-child(even) {
          background-color: #F9FAFB;
        }
        .xlsx-preview-wrapper tr:hover {
          background-color: #F3F4F6;
        }
      `}} />
      <div
        className="xlsx-preview-wrapper"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ─── Text / CSV preview ──────────────────────────────────────────────────────

function TextPreview({ src, mimeType, onDownload }: { src: string; mimeType: string; onDownload: () => void }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (loading) return <PreviewLoading label="Loading file…" />;
  if (error) return <PreviewError onDownload={onDownload} />;

  const isCsv = mimeType === "text/csv" || mimeType.includes("csv");
  return (
    <div className="flex-1 overflow-auto bg-white">
      {isCsv ? (
        <div className="p-6 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {content!.split("\n").filter(Boolean).map((row, i) => (
                <tr key={i} className={i === 0 ? "bg-gray-100 font-semibold" : "even:bg-gray-50/50"}>
                  {row.split(",").map((cell, j) => (
                    <td key={j} className="border px-3 py-2 whitespace-nowrap" style={{ borderColor: "#E5E7EB", color: "#1F2937" }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="p-8 text-xs leading-relaxed font-mono whitespace-pre-wrap bg-gray-50" style={{ color: "#1F2937", fontFamily: 'Consolas, Menlo, Monaco, "Courier New", monospace' }}>
          {content}
        </pre>
      )}
    </div>
  );
}

// ─── Unsupported format fallback ─────────────────────────────────────────────

function UnsupportedPreview({
  name,
  mimeType,
  sizeBytes,
  onDownload,
  signedUrl,
}: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  onDownload: (url: string) => void;
  signedUrl: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-neutral-900 px-8 text-neutral-300">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700 shadow-lg" style={{ backgroundColor: "#262626", borderColor: "#404040" }}>
        <FileText className="h-7 w-7 text-neutral-400" style={{ color: "#A3A3A3" }} />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-neutral-200" style={{ color: "#E5E5E5" }}>{name}</p>
        <p className="text-xs text-neutral-400" style={{ color: "#A3A3A3" }}>{mimeType} · {formatBytes(sizeBytes)}</p>
      </div>
      <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 text-center max-w-xs" style={{ backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.2)" }}>
        <p className="text-xs font-medium text-amber-500" style={{ color: "#F59E0B" }}>Preview not available for this file type</p>
        <p className="text-[10px] mt-0.5" style={{ color: "rgba(217, 119, 6, 0.8)" }}>Download the original file to view it.</p>
      </div>
      <button
        type="button"
        onClick={() => onDownload(signedUrl)}
        className="inline-flex items-center gap-2 rounded-lg bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2"
        style={{ backgroundColor: "#DC2626", color: "#FFFFFF" }}
      >
        <Download className="h-3.5 w-3.5" style={{ color: "#FFFFFF" }} />
        Download Original
      </button>
    </div>
  );
}

// ─── Format detection ────────────────────────────────────────────────────────

function isDocxFile(mimeType: string): boolean {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  );
}

function isXlsxFile(mimeType: string): boolean {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  );
}

function isPreviewable(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    isDocxFile(mimeType) ||
    isXlsxFile(mimeType)
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export function FilePreviewModal({ isOpen, onClose, attachment, onDownload }: FilePreviewModalProps) {
  const [scale, setScale] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

  // Reset zoom settings on open or attachment changes
  React.useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [isOpen, attachment]);

  if (!isOpen) return null;

  const { name, mimeType, sizeBytes, signedUrl, attachmentId } = attachment;
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const isText = mimeType.startsWith("text/") || mimeType === "application/json";
  const isDocx = isDocxFile(mimeType);
  const isXlsx = isXlsxFile(mimeType);
  const canRender = isPreviewable(mimeType);

  function handleZoomIn() {
    setScale((s) => Math.min(s + 0.25, 3));
  }
  
  function handleZoomOut() {
    setScale((s) => Math.max(s - 0.25, 0.25));
  }
  
  function handleRotate() {
    setRotation((r) => r + 90);
  }
  
  function handleReset() {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }

  function handleMouseDown(e: React.MouseEvent) {
    // Initiate pan drag on outer dark canvas wrapper only
    if (e.target === e.currentTarget) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950/85 backdrop-blur-md"
      data-testid="file-preview-modal"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${name}`}
    >
      {/* Premium Dark Header */}
      <div className="flex h-14 shrink-0 items-center justify-between bg-neutral-900 border-b border-neutral-800 px-4 text-white" style={{ backgroundColor: "#171717", borderBottomColor: "#262626" }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-800" style={{ backgroundColor: "#262626" }}>
            {isImage ? (
              <Eye className="h-4 w-4 text-blue-400" style={{ color: "#60A5FA" }} />
            ) : isPdf ? (
              <FileText className="h-4 w-4 text-red-400" style={{ color: "#F87171" }} />
            ) : isDocx ? (
              <FileText className="h-4 w-4 text-blue-400" style={{ color: "#60A5FA" }} />
            ) : isXlsx ? (
              <FileSpreadsheet className="h-4 w-4 text-green-400" style={{ color: "#4ADE80" }} />
            ) : (
              <FileText className="h-4 w-4 text-neutral-400" style={{ color: "#A3A3A3" }} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "#FFFFFF" }}>{name}</p>
            <p className="text-[10px]" style={{ color: "#A3A3A3" }}>
              {formatBytes(sizeBytes)}
              {!canRender && " · Download to view"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onDownload(signedUrl)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ backgroundColor: "#DC2626", color: "#FFFFFF" }}
            aria-label="Download original file"
          >
            <Download className="h-3.5 w-3.5" style={{ color: "#FFFFFF" }} />
            Download
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-neutral-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] text-neutral-400 hover:text-white"
            style={{ color: "#A3A3A3" }}
            aria-label="Close preview"
          >
            <X className="h-4 w-4" style={{ color: "#FFFFFF" }} />
          </button>
        </div>
      </div>

      {/* Main Google Drive-style Canvas */}
      <div
        className="flex-1 relative bg-neutral-950 overflow-hidden flex items-center justify-center p-6 md:p-12 cursor-grab animate-fade-in"
        style={{ ...isDragging ? { cursor: "grabbing" } : undefined, backgroundColor: "#0A0A0A" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {isImage ? (
          <ImagePreview
            src={signedUrl}
            name={name}
            scale={scale}
            rotation={rotation}
            position={position}
            isDragging={isDragging}
          />
        ) : (
          /* Structured Centered White Sheet Card */
          <div
            className="w-full bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col select-none origin-center"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: isDragging ? "none" : "transform 0.15s ease-out",
              width: isXlsx ? "92%" : "700px",
              maxWidth: "100%",
              height: "calc(100vh - 160px)",
              maxHeight: "850px",
            }}
          >
            {isPdf ? (
              <PdfPreview src={signedUrl} onDownload={() => onDownload(signedUrl)} />
            ) : isDocx && attachmentId ? (
              <DocxPreview attachmentId={attachmentId} onDownload={() => onDownload(signedUrl)} />
            ) : isXlsx && attachmentId ? (
              <XlsxPreview attachmentId={attachmentId} onDownload={() => onDownload(signedUrl)} />
            ) : isText ? (
              <TextPreview src={signedUrl} mimeType={mimeType} onDownload={() => onDownload(signedUrl)} />
            ) : (
              <UnsupportedPreview
                name={name}
                mimeType={mimeType}
                sizeBytes={sizeBytes}
                onDownload={onDownload}
                signedUrl={signedUrl}
              />
            )}
          </div>
        )}

        {/* Floating Google Drive-style pill controls */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-neutral-900/95 border border-neutral-800 px-4 py-1.5 shadow-2xl backdrop-blur-md text-white select-none" style={{ backgroundColor: "#171717", borderColor: "#262626" }}>
          <button
            type="button"
            onClick={handleZoomOut}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-800 transition-colors text-neutral-300 hover:text-white focus:outline-none"
            style={{ color: "#D4D4D4" }}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" style={{ color: "#D4D4D4" }} />
          </button>
          <span className="text-xs font-semibold min-w-[3rem] text-center text-neutral-200" style={{ color: "#FFFFFF" }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-800 transition-colors text-neutral-300 hover:text-white focus:outline-none"
            style={{ color: "#D4D4D4" }}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" style={{ color: "#D4D4D4" }} />
          </button>
          <div className="w-px h-5 bg-neutral-800 mx-1" style={{ backgroundColor: "#262626" }} />
          <button
            type="button"
            onClick={handleRotate}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-800 transition-colors text-neutral-300 hover:text-white focus:outline-none"
            style={{ color: "#D4D4D4" }}
            aria-label="Rotate clockwise"
          >
            <RotateCw className="h-4 w-4" style={{ color: "#D4D4D4" }} />
          </button>
          {(scale !== 1 || rotation !== 0 || position.x !== 0 || position.y !== 0) && (
            <>
              <div className="w-px h-5 bg-neutral-800 mx-1" style={{ backgroundColor: "#262626" }} />
              <button
                type="button"
                onClick={handleReset}
                className="text-[10px] font-bold tracking-wide uppercase px-2.5 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors focus:outline-none"
                style={{ backgroundColor: "#262626", color: "#FFFFFF" }}
              >
                Reset
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
