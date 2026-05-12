"use client";

import { useEffect, useRef, useId } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { panelAppear, backdropFade } from "@/components/foundation/motion-primitives";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({ open, onClose, title, subtitle, children, footer, size = "md", className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      const timer = setTimeout(() => {
        dialogRef.current?.focus();
      }, 50);
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "";
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <motion.div
            variants={backdropFade}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 bg-[rgba(15,23,42,0.45)] backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Dialog container */}
          <div className="absolute inset-0 flex items-start justify-center px-4 py-12 overflow-y-auto">
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={subtitle ? descId : undefined}
              tabIndex={-1}
              variants={panelAppear}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={cn(
                "relative w-full overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-2xl outline-none",
                sizeClasses[size],
                className
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-[var(--border-soft)] px-6 py-4">
                <div>
                  <h2 id={titleId} className="text-base font-semibold text-[var(--text-primary)]">
                    {title}
                  </h2>
                  {subtitle && (
                    <p id={descId} className="mt-0.5 text-sm text-[var(--text-muted)]">
                      {subtitle}
                    </p>
                  )}
                </div>
                <motion.button
                  type="button"
                  onClick={onClose}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.94 }}
                  transition={{ duration: 0.12 }}
                  className="ml-4 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
                  aria-label="Close dialog"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </motion.button>
              </div>

              {/* Body */}
              <div className="max-h-[60vh] overflow-y-auto px-6 py-5">{children}</div>

              {/* Footer */}
              {footer && (
                <div className="flex items-center justify-end gap-3 border-t border-[var(--border-soft)] px-6 py-4">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
