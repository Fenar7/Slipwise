"use client";

import { useEffect, useState, useRef } from "react";
import { useFormContext } from "react-hook-form";
import type { InvoiceFormValues } from "../types";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  gstin: string | null;
}

interface CustomerPickerProps {
  customers: Customer[];
  onSelect?: (customer: Customer) => void;
}

export function CustomerPicker({ customers, onSelect }: CustomerPickerProps) {
  const { setValue } = useFormContext<InvoiceFormValues>();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectCustomer = (customer: Customer) => {
    setSelectedName(customer.name);
    setValue("clientName", customer.name);
    if (customer.address) setValue("clientAddress", customer.address);
    if (customer.email) setValue("clientEmail", customer.email);
    if (customer.phone) setValue("clientPhone", customer.phone);
    if (customer.gstin) setValue("clientTaxId", customer.gstin);
    setIsOpen(false);
    setSearch("");
    onSelect?.(customer);
  };

  const clearCustomer = () => {
    setSelectedName("");
    setValue("clientName", "");
    setValue("clientAddress", "");
    setValue("clientEmail", "");
    setValue("clientPhone", "");
    setValue("clientTaxId", "");
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

  if (customers.length === 0) return null;

  return (
    <div ref={ref} className="relative mb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--foreground-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {selectedName ? `Customer: ${selectedName}` : "Select saved customer"}
        </button>
        {selectedName && (
          <button
            type="button"
            onClick={clearCustomer}
            className="text-xs text-slate-400 hover:text-red-500"
          >
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
              placeholder="Search customers..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">No customers found</p>
            ) : (
              filtered.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => selectCustomer(customer)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
                >
                  <div className="font-medium text-slate-900">{customer.name}</div>
                  {customer.email && (
                    <div className="text-xs text-slate-400">{customer.email}</div>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 p-2">
            <a
              href="/app/data/customers/new"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-2 text-sm text-[var(--accent)] hover:bg-slate-50 rounded-lg"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add new customer
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
