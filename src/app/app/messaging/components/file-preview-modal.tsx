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
    <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-gray-50">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#C4C4C4" }} />
      <p className="text-xs font-medium" style={{ color: "#79747E" }}>{label}</p>
    </div>
  );
}

function PreviewError({ onRetry, onDownload }: { onRetry?: () => void; onDownload?: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-gray-50 px-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-100">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>Could not load preview</p>
        <p className="text-xs max-w-xs" style={{ color: "#79747E" }}>
          The file could not be rendered. You can download the original to view it.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          >
            <Eye className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          >
            <Download className="h-3.5 w-3.5" />
            Download Original
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Image preview with zoom/pan/rotate ──────────────────────────────────────

function ImagePreview({ src, name }: { src: string; name: string }) {
  const [scale, setScale] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

  function handleZoomIn() { setScale((s) => Math.min(s + 0.25, 3)); }
  function handleZoomOut() { setScale((s) => Math.max(s - 0.25, 0.25)); }
  function handleRotate() { setRotation((r) => r + 90); }
  function handleReset() { setScale(1); setRotation(0); setPosition({ x: 0, y: 0 }); }

  function handleMouseDown(e: React.MouseEvent) {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }

  function handleMouseUp() { setIsDragging(false); }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-center gap-1.5 border-b bg-gray-50 px-4 py-2 shrink-0" style={{ borderColor: "#E0E0E0" }}>
        <button type="button" onClick={handleZoomOut} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-200 transition-colors" aria-label="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" style={{ color: "#49454F" }} />
        </button>
        <span className="text-xs font-medium min-w-[3rem] text-center" style={{ color: "#49454F" }}>
          {Math.round(scale * 100)}%
        </span>
        <button type="button" onClick={handleZoomIn} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-200 transition-colors" aria-label="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" style={{ color: "#49454F" }} />
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button type="button" onClick={handleRotate} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-200 transition-colors" aria-label="Rotate">
          <RotateCw className="h-3.5 w-3.5" style={{ color: "#49454F" }} />
        </button>
        {(scale !== 1 || rotation !== 0 || position.x !== 0 || position.y !== 0) && (
          <button type="button" onClick={handleReset} className="text-xs font-semibold px-2 py-1 rounded-lg hover:bg-gray-200 transition-colors" style={{ color: "#49454F" }}>
            Reset
          </button>
        )}
      </div>
      <div
        className="flex-1 overflow-hidden bg-[#1a1a1a] flex items-center justify-center cursor-grab"
        style={isDragging ? { cursor: "grabbing" } : undefined}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          className="max-w-full max-h-full object-contain select-none transition-transform duration-75"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            pointerEvents: "none",
          }}
          draggable={false}
        />
      </div>
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

    return () => { cancelled = true; };
  }, [attachmentId]);

  React.useEffect(() => {
    return fetchPreview();
  }, [fetchPreview]);

  if (loading) return <PreviewLoading label="Converting document…" />;
  if (error || !html) return <PreviewError onRetry={fetchPreview} onDownload={onDownload} />;

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div
        className="mx-auto max-w-3xl p-8 prose prose-sm prose-slate"
        style={{ color: "#1C1B1F" }}
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

    return () => { cancelled = true; };
  }, [attachmentId]);

  React.useEffect(() => {
    return fetchPreview();
  }, [fetchPreview]);

  if (loading) return <PreviewLoading label="Loading spreadsheet…" />;
  if (error || !html) return <PreviewError onRetry={fetchPreview} onDownload={onDownload} />;

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div
        className="p-4 text-xs"
        style={{ color: "#1C1B1F" }}
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
        if (!cancelled) { setContent(text); setLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [src]);

  if (loading) return <PreviewLoading label="Loading file…" />;
  if (error) return <PreviewError onDownload={onDownload} />;

  const isCsv = mimeType === "text/csv" || mimeType.includes("csv");
  return (
    <div className="flex-1 overflow-auto bg-white">
      {isCsv ? (
        <div className="p-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {content!.split("\n").filter(Boolean).map((row, i) => (
                <tr key={i} className={i === 0 ? "bg-gray-50 font-semibold" : "even:bg-gray-50/50"}>
                  {row.split(",").map((cell, j) => (
                    <td key={j} className="border px-2 py-1 whitespace-nowrap" style={{ borderColor: "#E8E8E8", color: "#1C1B1F" }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap" style={{ color: "#1C1B1F" }}>
          {content}
        </pre>
      )}
    </div>
  );
}

// ─── Unsupported format fallback ─────────────────────────────────────────────

function UnsupportedPreview({ name, mimeType, sizeBytes, onDownload, signedUrl }: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  onDownload: (url: string) => void;
  signedUrl: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-gray-50 px-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white border shadow-sm" style={{ borderColor: "#E8E8E8" }}>
        <FileText className="h-7 w-7" style={{ color: "#C4C4C4" }} />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>{name}</p>
        <p className="text-xs" style={{ color: "#79747E" }}>{mimeType} · {formatBytes(sizeBytes)}</p>
      </div>
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-center max-w-xs">
        <p className="text-xs font-medium text-amber-800">Preview not available for this file type</p>
        <p className="text-[10px] text-amber-600 mt-0.5">Download the original file to view it.</p>
      </div>
      <button
        type="button"
        onClick={() => onDownload(signedUrl)}
        className="inline-flex items-center gap-2 rounded-lg bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2"
      >
        <Download className="h-3.5 w-3.5" />
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
  if (!isOpen) return null;

  const { name, mimeType, sizeBytes, signedUrl, attachmentId } = attachment;
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const isText = mimeType.startsWith("text/") || mimeType === "application/json";
  const isDocx = isDocxFile(mimeType);
  const isXlsx = isXlsxFile(mimeType);
  const canRender = isPreviewable(mimeType);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm"
      data-testid="file-preview-modal"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${name}`}
    >
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between bg-white border-b px-4" style={{ borderColor: "#E0E0E0" }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            {isImage ? (
              <Eye className="h-4 w-4" style={{ color: "#49454F" }} />
            ) : isPdf ? (
              <FileText className="h-4 w-4 text-red-500" />
            ) : isDocx ? (
              <FileText className="h-4 w-4 text-blue-600" />
            ) : isXlsx ? (
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
            ) : (
              <FileText className="h-4 w-4" style={{ color: "#79747E" }} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "#1C1B1F" }}>{name}</p>
            <p className="text-[10px]" style={{ color: "#79747E" }}>
              {formatBytes(sizeBytes)}
              {!canRender && " · Download to view"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDownload(signedUrl)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            aria-label="Download original file"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" style={{ color: "#49454F" }} />
          </button>
        </div>
      </div>

      {/* Preview body */}
      {isImage ? (
        <ImagePreview src={signedUrl} name={name} />
      ) : isPdf ? (
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
  );
}
