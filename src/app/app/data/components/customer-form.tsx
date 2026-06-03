"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { createCustomer, updateCustomer, type CustomerInput } from "../actions";
import { TagPicker } from "@/features/tags/components/tag-picker";

interface CustomerFormProps {
  customer?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    gstin: string | null;
    defaultTagAssignments?: Array<{ tag: { id: string; name: string; slug: string; color: string | null } }>;
  };
}

export function CustomerForm({ customer }: CustomerFormProps) {
  const router = useRouter();
  const isEdit = !!customer;
  const [tagIds, setTagIds] = useState<string[]>(
    customer?.defaultTagAssignments?.map((a) => a.tag.id) ?? []
  );
  const [error, setError] = useState<string | null>(null);
  
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CustomerInput>({
    defaultValues: customer ? {
      name: customer.name,
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      taxId: customer.taxId || "",
      gstin: customer.gstin || "",
    } : undefined,
  });
  
  const onSubmit = async (data: CustomerInput) => {
    setError(null);
    const result = isEdit
      ? await updateCustomer(customer.id, { ...data, tagIds })
      : await createCustomer({ ...data, tagIds });
    
    if (result.success) {
      router.push("/app/clients");
    } else {
      setError("error" in result ? result.error : "An unexpected error occurred");
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200">
          {error}
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Name *
        </label>
        <input
          {...register("name", { required: "Name is required" })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email"
            {...register("email")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
          <input
            {...register("phone")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
      </div>
      
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
        <textarea
          {...register("address")}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tax ID</label>
          <input
            {...register("taxId")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">GSTIN</label>
          <input
            {...register("gstin")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Default Tags
        </label>
        <p className="mb-2 text-xs text-slate-500">
          These tags will be automatically suggested when creating invoices for this customer.
        </p>
        <TagPicker
          selectedIds={tagIds}
          onChange={setTagIds}
          placeholder="Add default tags..."
        />
      </div>
      
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : isEdit ? "Update Customer" : "Create Customer"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
