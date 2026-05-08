"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  A4_DOCUMENT_HEIGHT,
  PREVIEW_DOCUMENT_FRAME_WIDTH,
} from "@/components/document/document-constants";

type DocumentPreviewSurfaceProps = {
  title: string;
  templateName: string;
  children: ReactNode;
};

export function DocumentPreviewSurface({
  title,
  templateName,
  children,
}: DocumentPreviewSurfaceProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [zoom, setZoom] = useState<number | "fit">("fit");

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateViewportMetrics = () => {
      setViewportWidth(viewport.clientWidth - 32); // minus padding
    };

    updateViewportMetrics();

    const viewportObserver = new ResizeObserver(updateViewportMetrics);
    viewportObserver.observe(viewport);

    return () => viewportObserver.disconnect();
  }, []);

  const fitZoom = Math.min(1, viewportWidth / PREVIEW_DOCUMENT_FRAME_WIDTH);
  const currentZoom = zoom === "fit" ? fitZoom : zoom / 100;
  const displayZoom = Math.round(currentZoom * 100);

  const scaledWidth = PREVIEW_DOCUMENT_FRAME_WIDTH * currentZoom;
  const scaledHeight = A4_DOCUMENT_HEIGHT * currentZoom;

  const zoomOut = () => {
    if (zoom === "fit") {
      setZoom(Math.max(25, Math.round(fitZoom * 100) - 10));
    } else {
      setZoom(Math.max(25, zoom - 10));
    }
  };

  const zoomIn = () => {
    if (zoom === "fit") {
      setZoom(Math.min(200, Math.round(fitZoom * 100) + 10));
    } else {
      setZoom(Math.min(200, zoom + 10));
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Preview header bar with zoom controls */}
      <div className="mb-3 flex items-center justify-between shrink-0">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Preview
          </p>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {title} · {templateName}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border-soft)] bg-white p-0.5">
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] transition-colors"
            title="Zoom out"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setZoom("fit")}
            className={`min-w-[3.5rem] px-2 py-1 text-center text-xs font-medium rounded-md transition-colors ${
              zoom === "fit" 
                ? "bg-[var(--brand-cta)] text-white" 
                : "text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]"
            }`}
            title="Fit to width"
          >
            {zoom === "fit" ? "Fit" : `${displayZoom}%`}
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] transition-colors"
            title="Zoom in"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Preview viewport - scrollable */}
      <div 
        ref={viewportRef} 
        data-testid="document-preview-viewport"
        className="flex-1 overflow-auto rounded-lg bg-[var(--surface-subtle)]"
      >
        <div className="p-4 flex justify-center min-h-full">
          <div
            className="bg-white shadow-sm overflow-hidden"
            style={{
              width: `${scaledWidth}px`,
              height: `${scaledHeight}px`,
            }}
          >
            <div
              style={{
                width: `${PREVIEW_DOCUMENT_FRAME_WIDTH}px`,
                height: `${A4_DOCUMENT_HEIGHT}px`,
                transform: `scale(${currentZoom})`,
                transformOrigin: "top left",
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}