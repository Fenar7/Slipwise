import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/* ======================================================================
   Finance Table Primitives
   Standardized table styling for dense accounting data across Books.
   ====================================================================== */

interface FinanceTableProps {
  children: ReactNode;
  className?: string;
}

export function FinanceTable({ children, className }: FinanceTableProps) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full">{children}</table>
    </div>
  );
}

interface FinanceTableHeaderProps {
  children: ReactNode;
  className?: string;
}

export function FinanceTableHeader({ children, className }: FinanceTableHeaderProps) {
  return (
    <thead>
      <tr
        className={cn(
          "border-b border-[var(--border-soft)] bg-[var(--surface-subtle)] text-left text-[0.7rem] uppercase tracking-[0.12em] text-[var(--text-muted)]",
          className
        )}
      >
        {children}
      </tr>
    </thead>
  );
}

interface FinanceTableHeadProps {
  children: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}

export function FinanceTableHead({ children, className, align = "left" }: FinanceTableHeadProps) {
  return (
    <th
      className={cn(
        "px-5 py-2.5 font-medium whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </th>
  );
}

interface FinanceTableBodyProps {
  children: ReactNode;
  className?: string;
}

export function FinanceTableBody({ children, className }: FinanceTableBodyProps) {
  return <tbody className={cn("divide-y divide-[var(--border-soft)]", className)}>{children}</tbody>;
}

interface FinanceTableRowProps {
  children: ReactNode;
  className?: string;
}

export function FinanceTableRow({ children, className }: FinanceTableRowProps) {
  return (
    <tr className={cn("transition-colors hover:bg-[var(--surface-selected)]", className)}>
      {children}
    </tr>
  );
}

interface FinanceTableCellProps {
  children: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  variant?: "default" | "primary" | "muted" | "numeric";
  colSpan?: number;
}

export function FinanceTableCell({
  children,
  className,
  align = "left",
  variant = "default",
  colSpan,
}: FinanceTableCellProps) {
  const variantClasses = {
    default: "text-[var(--text-secondary)]",
    primary: "font-medium text-[var(--text-primary)]",
    muted: "text-[var(--text-muted)]",
    numeric: "font-medium text-[var(--text-primary)] tabular-nums text-right",
  };

  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-5 py-3 text-sm",
        variantClasses[variant],
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </td>
  );
}

interface FinanceTableEmptyProps {
  colSpan: number;
  message?: string;
  className?: string;
}

export function FinanceTableEmpty({
  colSpan,
  message = "No records found",
  className,
}: FinanceTableEmptyProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={cn(
          "px-5 py-10 text-center text-sm text-[var(--text-muted)]",
          className
        )}
      >
        {message}
      </td>
    </tr>
  );
}
