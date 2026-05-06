"use client";

import { useEffect, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import type { VoucherFormValues } from "../types";

interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
}

interface VendorPickerProps {
  vendors: Vendor[];
  label?: string;
  onSelect?: (vendor: Vendor) => void;
}

export function VendorPicker({ vendors, label = "Select contact", onSelect }: VendorPickerProps) {
  const { setValue } = useFormContext<VoucherFormValues>();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectVendor = (vendor: Vendor) => {
    setSelectedName(vendor.name);
    setValue("vendorId", vendor.id);
    setValue("counterpartyName", vendor.name);
    setIsOpen(false);
    setSearch("");
    onSelect?.(vendor);
  };

  const clearVendor = () => {
    setSelectedName("");
    setValue("vendorId", undefined);
    setValue("counterpartyName", "");
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (vendors.length === 0) return null;

  return (
    <div ref={ref} className="relative mb-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--foreground-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          {selectedName ? selectedName : label}
        </button>
        {selectedName && (
          <button type="button" onClick={clearVendor} className="text-xs text-slate-400 hover:text-red-500">
            Clear
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 w-72 rounded-xl border border-[var(--border-soft)] bg-white shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">No vendors found</p>
            ) : (
              filtered.map((vendor) => (
                <button
                  key={vendor.id}
                  type="button"
                  onClick={() => selectVendor(vendor)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <div className="font-medium text-slate-900">{vendor.name}</div>
                  {vendor.gstin && <div className="text-xs text-slate-400">GSTIN: {vendor.gstin}</div>}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 p-2">
            <a
              href="/app/data/vendors/new"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-2 text-sm text-[var(--accent)] hover:bg-slate-50 rounded-lg"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add new vendor
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
