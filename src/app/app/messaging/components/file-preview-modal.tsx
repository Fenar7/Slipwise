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

// ─── DOCX preview via client-side docx-preview rendering ──────────────────────────

function fixTofuSymbols(parent: HTMLElement) {
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue || "";
    let newText = "";
    let changed = false;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      // Check if character is in Private Use Area (specifically Wingdings / Symbol mapping U+F000 to U+F0FF)
      if (char >= 0xF000 && char <= 0xF0FF) {
        changed = true;
        // Map to standard characters based on common Wingdings characters
        switch (char) {
          case 0xF0B7: // standard round bullet
          case 0xF0A3: // standard round bullet
          case 0xF0A7: // square bullet
          case 0xF0A8: // square bullet
          case 0xF0E0: // document/letter bullet
          case 0xF0D8: // diamond
          case 0xF0B0: // small bullet
          case 0xF06F: // circle / list bullet
          case 0xF0D4: // diamond arrow
          case 0xF076: // standard bullet
          case 0xF03B: // bullet
            newText += "•";
            break;
          case 0xF071: // white square
          case 0xF02D: // white square
            newText += "□";
            break;
          case 0xF0FC: // check mark
            newText += "✓";
            break;
          case 0xF0FE: // checked box
            newText += "☑";
            break;
          default:
            newText += "•"; // fallback bullet
            break;
        }
      } else {
        newText += text[i];
      }
    }
    if (changed) {
      node.nodeValue = newText;
      if (node.parentElement) {
        node.parentElement.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      }
    }
  }
}

function DocxPreview({ src, onDownload }: { src: string; onDownload: () => void }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const fetchAndRender = React.useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch document file");
        return res.arrayBuffer();
      })
      .then(async (arrayBuffer) => {
        if (cancelled) return;
        try {
          const docx = await import("docx-preview");
          if (cancelled) return;
          if (containerRef.current) {
            containerRef.current.innerHTML = "";
            await docx.renderAsync(arrayBuffer, containerRef.current, undefined, {
              className: "docx-rendered-page",
              inWrapper: false,
              ignoreWidth: false,
              ignoreHeight: false,
            });
            // Fix unmapped Wingdings / Symbol tofu boxes
            fixTofuSymbols(containerRef.current);
          }
          setLoading(false);
        } catch (renderErr) {
          console.error("docx-preview rendering error:", renderErr);
          setError(true);
          setLoading(false);
        }
      })
      .catch((fetchErr) => {
        console.error("docx fetch error:", fetchErr);
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  React.useEffect(() => {
    return fetchAndRender();
  }, [fetchAndRender]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F3F4F6]">
      <style dangerouslySetInnerHTML={{ __html: `
        .docx-rendered-container {
          background-color: #F3F4F6 !important;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }
        .docx-rendered-container .docx-rendered-page {
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
          border-radius: 4px !important;
          border: 1px solid #E5E7EB !important;
          background-color: #FFFFFF !important;
          margin: 0 auto 10px auto !important;
          max-width: 100% !important;
          height: auto !important;
          box-sizing: border-box !important;
        }
        .docx-rendered-container .docx-rendered-page p,
        .docx-rendered-container .docx-rendered-page span,
        .docx-rendered-container .docx-rendered-page h1,
        .docx-rendered-container .docx-rendered-page h2,
        .docx-rendered-container .docx-rendered-page h3,
        .docx-rendered-container .docx-rendered-page h4 {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
        .docx-rendered-container .docx-list-bullet {
          font-size: 0 !important;
          display: inline-block !important;
          vertical-align: middle !important;
        }
        .docx-rendered-container .docx-list-bullet::after {
          content: "•" !important;
          font-size: 14px !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          color: #1F2937 !important;
          font-weight: bold !important;
          margin-right: 6px !important;
        }
      `}} />
      {loading && <PreviewLoading label="Rendering Word document..." />}
      {error && <PreviewError onRetry={fetchAndRender} onDownload={onDownload} />}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 md:p-8 docx-rendered-container"
        style={{ display: loading || error ? "none" : "flex" }}
      />
    </div>
  );
}

// ─── XLSX preview via client-side sheetjs parsing ─────────────────────────────────

function XlsxPreview({ src, onDownload }: { src: string; onDownload: () => void }) {
  const [workbook, setWorkbook] = React.useState<any>(null);
  const [xlsxModule, setXlsxModule] = React.useState<any>(null);
  const [activeSheetIndex, setActiveSheetIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const fetchAndParse = React.useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch spreadsheet file");
        return res.arrayBuffer();
      })
      .then(async (arrayBuffer) => {
        if (cancelled) return;
        try {
          const XLSX = await import("xlsx");
          if (cancelled) return;
          const wb = XLSX.read(arrayBuffer, { type: "array" });
          setWorkbook(wb);
          setXlsxModule(XLSX);
          setLoading(false);
        } catch (parseErr) {
          console.error("XLSX parsing error:", parseErr);
          setError(true);
          setLoading(false);
        }
      })
      .catch((fetchErr) => {
        console.error("XLSX fetch error:", fetchErr);
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  React.useEffect(() => {
    return fetchAndParse();
  }, [fetchAndParse]);

  if (loading) return <PreviewLoading label="Loading spreadsheet..." />;
  if (error || !workbook || !xlsxModule) return <PreviewError onRetry={fetchAndParse} onDownload={onDownload} />;

  const sheetNames = workbook.SheetNames;
  const currentSheetName = sheetNames[activeSheetIndex];
  let sheetHtml = "";

  if (currentSheetName) {
    try {
      const sheet = workbook.Sheets[currentSheetName];
      sheetHtml = xlsxModule.utils.sheet_to_html(sheet, { header: "" });
    } catch (err) {
      console.error("XLSX sheet conversion error:", err);
      sheetHtml = "<p className='p-4 text-red-500 font-semibold'>Error rendering sheet.</p>";
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        .xlsx-preview-grid {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1F2937;
          padding: 24px;
        }
        .xlsx-preview-grid table {
          border-collapse: collapse;
          width: 100%;
          font-size: 13px;
          border: 1px solid #D1D5DB;
        }
        .xlsx-preview-grid th,
        .xlsx-preview-grid td {
          border: 1px solid #E5E7EB;
          padding: 8px 12px;
          text-align: left;
          min-width: 100px;
        }
        .xlsx-preview-grid th {
          background-color: #F3F4F6;
          font-weight: 600;
          color: #111827;
          border: 1px solid #D1D5DB;
        }
        .xlsx-preview-grid tr:nth-child(even) {
          background-color: #F9FAFB;
        }
        .xlsx-preview-grid tr:hover {
          background-color: #F3F4F6;
        }
      `}} />
      <div className="flex-1 overflow-auto xlsx-preview-grid">
        <div dangerouslySetInnerHTML={{ __html: sheetHtml }} />
      </div>

      {/* Premium Tab list at the bottom for multi-sheet view */}
      {sheetNames.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 bg-[#F3F4F6] border-t border-gray-250 px-4 pt-1 overflow-x-auto select-none">
          {sheetNames.map((name: string, index: number) => {
            const isActive = index === activeSheetIndex;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setActiveSheetIndex(index)}
                className="px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all focus:outline-none"
                style={{
                  backgroundColor: isActive ? "#FFFFFF" : "transparent",
                  color: isActive ? "#111827" : "#4B5563",
                  borderTopLeftRadius: "6px",
                  borderTopRightRadius: "6px",
                  borderLeft: isActive ? "1px solid #D1D5DB" : "1px solid transparent",
                  borderRight: isActive ? "1px solid #D1D5DB" : "1px solid transparent",
                  borderTop: isActive ? "3px solid #107C41" : "3px solid transparent",
                  boxShadow: isActive ? "0 -1px 2px rgba(0,0,0,0.05)" : "none",
                  marginTop: "2px"
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
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
}: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  onDownload: () => void;
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
        onClick={onDownload}
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
  const [isReady, setIsReady] = React.useState(false);

  // Reset zoom settings and defer mount to ensure zero animation lag
  React.useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
      setIsReady(false);
      const timer = requestAnimationFrame(() => {
        setIsReady(true);
      });
      return () => cancelAnimationFrame(timer);
    } else {
      setIsReady(false);
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

  // Fetch a fresh signed URL to prevent expiration JWT issues
  async function handleDownloadClick() {
    if (attachmentId) {
      try {
        const res = await fetch(`/api/messaging/attachments/${attachmentId}/download`);
        if (res.ok) {
          const json = await res.json();
          if (json?.data?.signedUrl) {
            onDownload(json.data.signedUrl);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to fetch fresh signed download URL:", err);
      }
    }
    // Fallback to original signed url
    onDownload(signedUrl);
  }

  function handleZoomIn() {
    setScale((s) => Math.min(s + 0.25, 3));
  }
  
  // Custom ZoomOut to handle page fitting scale correctly
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
    const target = e.target as HTMLElement;
    // Prevent dragging when clicking on inputs, select, iframe, buttons or spreadsheet tab bar
    if (
      target.closest("button") || 
      target.closest("a") || 
      target.closest("iframe") || 
      target.closest("select") || 
      target.closest("input") ||
      target.closest(".xlsx-preview-grid") || // let spreadsheet scroll/select natively
      target.closest("table") // let tables scroll natively
    ) {
      return;
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }

  // Force drag termination
  function handleMouseUp() {
    setIsDragging(false);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  // Get localized button label like macOS Quick Look
  const getOpenButtonLabel = () => {
    if (isDocx) return "Open with Microsoft Word";
    if (isPdf) return "Open with Preview";
    return "Download";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950/90 backdrop-blur-md"
      data-testid="file-preview-modal"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${name}`}
    >
      {/* macOS Quick Look Styled Header Bar */}
      <div 
        className="flex h-14 shrink-0 items-center justify-between border-b px-4 text-white" 
        style={{ backgroundColor: "#18181B", borderBottomColor: "#27272A" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Close button inside circular overlay */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors focus:outline-none"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" style={{ color: "#D4D4D4" }} />
          </button>
          
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-sm font-semibold truncate text-neutral-200 select-all">{name}</span>
            <span className="text-[10px] text-neutral-400 font-medium whitespace-nowrap">
              ({formatBytes(sizeBytes)})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Action / Download button styled like Apple Quick Look "Open with..." */}
          <button
            type="button"
            onClick={handleDownloadClick}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-all hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ 
              backgroundColor: "rgba(39, 39, 42, 0.6)", 
              borderColor: "#3F3F46", 
              color: "#F4F4F5"
            }}
            aria-label={getOpenButtonLabel()}
          >
            <Download className="h-3.5 w-3.5" style={{ color: "#D4D4D4" }} />
            {getOpenButtonLabel()}
          </button>
        </div>
      </div>

      {/* Main Google Drive-style Canvas */}
      <div
        className="flex-1 relative bg-[#09090B] overflow-hidden flex items-center justify-center p-6 md:p-12 cursor-grab animate-fade-in"
        style={{ ...isDragging ? { cursor: "grabbing" } : undefined }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {!isReady ? (
          <PreviewLoading label="Opening document..." />
        ) : isImage ? (
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
            className="w-full rounded-xl shadow-2xl overflow-hidden flex flex-col select-none origin-center"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: isDragging ? "none" : "transform 0.15s ease-out",
              width: isXlsx ? "92%" : isDocx ? "920px" : "760px",
              maxWidth: "100%",
              height: "calc(100vh - 160px)",
              maxHeight: "850px",
              backgroundColor: isDocx ? "#F3F4F6" : "#FFFFFF"
            }}
          >
            {isPdf ? (
              <PdfPreview src={signedUrl} onDownload={handleDownloadClick} />
            ) : isDocx ? (
              <DocxPreview src={signedUrl} onDownload={handleDownloadClick} />
            ) : isXlsx ? (
              <XlsxPreview src={signedUrl} onDownload={handleDownloadClick} />
            ) : isText ? (
              <TextPreview src={signedUrl} mimeType={mimeType} onDownload={handleDownloadClick} />
            ) : (
              <UnsupportedPreview
                name={name}
                mimeType={mimeType}
                sizeBytes={sizeBytes}
                onDownload={handleDownloadClick}
              />
            )}
          </div>
        )}

        {/* Floating Google Drive-style pill controls */}
        {isReady && (
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
        )}
      </div>
    </div>
  );
}
