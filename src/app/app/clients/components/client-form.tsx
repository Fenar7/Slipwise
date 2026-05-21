"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { createCustomer, updateCustomer, type CustomerInput } from "@/app/app/data/actions";
import { TagPicker } from "@/features/tags/components/tag-picker";
import { Button } from "@/components/ui/button";
import { XCircle, Loader2 } from "lucide-react";

interface ClientFormProps {
  client?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    gstin: string | null;
    defaultTagAssignments?: Array<{
      tag: { id: string; name: string; slug: string; color: string | null };
    }>;
  };
}

export function ClientForm({ client }: ClientFormProps) {
  const router = useRouter();
  const isEdit = !!client;
  const [error, setError] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>(
    client?.defaultTagAssignments?.map((a) => a.tag.id) ?? []
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput>({
    defaultValues: client
      ? {
          name: client.name,
          email: client.email || "",
          phone: client.phone || "",
          address: client.address || "",
          taxId: client.taxId || "",
          gstin: client.gstin || "",
        }
      : {
          name: "",
          email: "",
          phone: "",
          address: "",
          taxId: "",
          gstin: "",
        },
  });

  const onSubmit = async (data: CustomerInput) => {
    setError(null);
    
    // Front-end sanity checks
    if (!data.name || data.name.trim() === "") {
      setError("Name is required");
      return;
    }

    if (data.email && data.email.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email.trim())) {
        setError("Invalid email format");
        return;
      }
    }

    if (data.phone && data.phone.trim() !== "") {
      const phoneRegex = /^[+\d\s-]{7,15}$/;
      if (!phoneRegex.test(data.phone.trim())) {
        setError("Phone number must be between 7 and 15 digits");
        return;
      }
    }

    if (data.gstin && data.gstin.trim() !== "") {
      const gstinRegex = /^[a-zA-Z0-9]{15}$/;
      if (!gstinRegex.test(data.gstin.trim())) {
        setError("GSTIN must be exactly 15 characters");
        return;
      }
    }

    const payload = {
      ...data,
      tagIds,
    };

    const result = isEdit
      ? await updateCustomer(client.id, payload)
      : await createCustomer(payload);

    if (result.success) {
      router.push(`/app/clients/${result.data.id}`);
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Non-blocking Error Banner */}
      {error && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm animate-in fade-in duration-200">
          <XCircle className="h-5 w-5 shrink-0 text-red-600" />
          <div className="space-y-1">
            <h5 className="font-semibold text-red-950">Form Submission Error</h5>
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Grid of Grouped Sections */}
      <div className="space-y-6">
        {/* Section 1: Primary Information */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] border-b border-[var(--border-soft)] pb-2">
            Primary Contact & Profile
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="col-span-full">
              <label htmlFor="name-input" className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Client Legal Name <span className="text-red-500 font-bold">*</span>
              </label>
              <input
                id="name-input"
                type="text"
                placeholder="Acme Corporation"
                {...register("name", { required: "Legal name is required" })}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="email-input" className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Primary Email Address <span className="text-[var(--text-muted)] font-normal text-[10px] lowercase">(optional)</span>
              </label>
              <input
                id="email-input"
                type="email"
                placeholder="billing@acme.com"
                {...register("email")}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>

            <div>
              <label htmlFor="phone-input" className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Primary Phone Number <span className="text-[var(--text-muted)] font-normal text-[10px] lowercase">(optional)</span>
              </label>
              <input
                id="phone-input"
                type="text"
                placeholder="+91 98765 43210"
                {...register("phone")}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Address */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] border-b border-[var(--border-soft)] pb-2">
            Address & Location
          </h3>
          <div>
            <label htmlFor="address-input" className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Billing Address <span className="text-[var(--text-muted)] font-normal text-[10px] lowercase">(optional)</span>
            </label>
            <textarea
              id="address-input"
              rows={3}
              placeholder="123 Financial District&#10;Sector 5, Bangalore&#10;Karnataka, 560001"
              {...register("address")}
              className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            />
          </div>
        </div>

        {/* Section 3: Tax & Identifiers */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] border-b border-[var(--border-soft)] pb-2">
            Tax & Legal Identifiers
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tax-id-input" className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Tax ID / PAN <span className="text-[var(--text-muted)] font-normal text-[10px] lowercase">(optional)</span>
              </label>
              <input
                id="tax-id-input"
                type="text"
                placeholder="ABCDE1234F"
                {...register("taxId")}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>

            <div>
              <label htmlFor="gstin-input" className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                GSTIN <span className="text-[var(--text-muted)] font-normal text-[10px] lowercase">(optional)</span>
              </label>
              <input
                id="gstin-input"
                type="text"
                placeholder="29ABCDE1234F1Z5"
                {...register("gstin")}
                className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Settings & Tags */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] border-b border-[var(--border-soft)] pb-2">
            Relationship Settings
          </h3>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Default Suggested Tags
            </label>
            <p className="mb-3.5 text-xs text-[var(--text-muted)]">
              These default tags will be pre-filled and automatically suggested whenever generating documents (invoices/quotes) for this client.
            </p>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-subtle)] p-4 shadow-inner">
              <TagPicker
                selectedIds={tagIds}
                onChange={setTagIds}
                placeholder="Assign default tags..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Form Submission Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-6 border-t border-[var(--border-soft)]">
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting}
          className="min-w-[140px] flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : isEdit ? (
            "Save Changes"
          ) : (
            "Create Client"
          )}
        </Button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            if (isEdit) {
              router.push(`/app/clients/${client.id}`);
            } else {
              router.push("/app/clients");
            }
          }}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-default)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
