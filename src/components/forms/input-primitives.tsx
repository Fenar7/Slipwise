"use client";

import {
  Controller,
  get,
  useFormContext,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { FieldShell } from "@/components/forms/field-shell";
import { cn } from "@/lib/utils";

function baseInputClass(hasError?: boolean) {
  return cn(
    "w-full rounded-lg border bg-white px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-all placeholder:text-[var(--muted-foreground)]",
    hasError
      ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
      : "border-[var(--border-default)] hover:border-[var(--border-default)] focus:border-[var(--brand-cta)] focus:ring-2 focus:ring-[var(--brand-cta)]/10",
  );
}

type BaseFieldProps<TFormValues extends FieldValues> = {
  name: Path<TFormValues>;
  label: string;
  hint?: string;
  required?: boolean;
};

type TextFieldProps<TFormValues extends FieldValues> = BaseFieldProps<TFormValues> & {
  type?: "text" | "number" | "date";
  placeholder?: string;
};

export function TextField<TFormValues extends FieldValues>({
  name,
  label,
  hint,
  required,
  type = "text",
  placeholder,
}: TextFieldProps<TFormValues>) {
  const {
    register,
    formState: { errors },
  } = useFormContext<TFormValues>();
  const fieldError = get(errors, name)?.message;

  return (
    <FieldShell
      label={label}
      htmlFor={name}
      hint={hint}
      required={required}
      error={typeof fieldError === "string" ? fieldError : undefined}
    >
      <input
        id={name}
        type={type}
        placeholder={placeholder}
        {...register(name)}
        className={baseInputClass(Boolean(fieldError))}
      />
    </FieldShell>
  );
}

type TextAreaFieldProps<TFormValues extends FieldValues> = BaseFieldProps<TFormValues> & {
  placeholder?: string;
  rows?: number;
};

export function TextAreaField<TFormValues extends FieldValues>({
  name,
  label,
  hint,
  required,
  placeholder,
  rows = 4,
}: TextAreaFieldProps<TFormValues>) {
  const {
    register,
    formState: { errors },
  } = useFormContext<TFormValues>();
  const fieldError = get(errors, name)?.message;

  return (
    <FieldShell
      label={label}
      htmlFor={name}
      hint={hint}
      required={required}
      error={typeof fieldError === "string" ? fieldError : undefined}
    >
      <textarea
        id={name}
        rows={rows}
        placeholder={placeholder}
        {...register(name)}
        className={cn(baseInputClass(Boolean(fieldError)), "min-h-[7.5rem] resize-y")}
      />
    </FieldShell>
  );
}

type SelectFieldProps<TFormValues extends FieldValues> = BaseFieldProps<TFormValues> & {
  options: Array<{ value: string; label: string }>;
};

export function SelectField<TFormValues extends FieldValues>({
  name,
  label,
  hint,
  required,
  options,
}: SelectFieldProps<TFormValues>) {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<TFormValues>();
  const fieldError = get(errors, name)?.message;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FieldShell
          label={label}
          htmlFor={name}
          hint={hint}
          required={required}
          error={typeof fieldError === "string" ? fieldError : undefined}
        >
          <select
            id={name}
            name={field.name}
            value={typeof field.value === "string" ? field.value : ""}
            onChange={(event) =>
              setValue(name, event.target.value as Path<TFormValues> extends never ? never : TFormValues[Path<TFormValues>], {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true,
              })
            }
            onBlur={field.onBlur}
            ref={field.ref}
            className={baseInputClass(Boolean(fieldError))}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldShell>
      )}
    />
  );
}

type ToggleFieldProps<TFormValues extends FieldValues> = BaseFieldProps<TFormValues>;

export function ToggleField<TFormValues extends FieldValues>({
  name,
  label,
  hint,
}: ToggleFieldProps<TFormValues>) {
  const { control } = useFormContext<TFormValues>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FieldShell label={label} hint={hint}>
          <button
            id={name}
            type="button"
            role="switch"
            aria-label={label}
            aria-checked={Boolean(field.value)}
            onClick={() => field.onChange(!field.value)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-[border-color,background-color,box-shadow]",
              field.value
                ? "border-[var(--accent)] bg-white"
                : "border-[var(--border-soft)] bg-white",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-5 text-[var(--foreground)]">
                {field.value ? "Visible in preview" : "Hidden from preview"}
              </span>
              <span className="mt-1 block text-[0.75rem] leading-5 text-[var(--foreground-soft)]/80">
                Toggle this block in the live document.
              </span>
            </span>
            <span
              className={cn(
                "relative inline-block h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors duration-200",
                field.value ? "bg-[var(--accent)]" : "bg-[#d1d5db]",
              )}
            >
              <span
                className={cn(
                  "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_2px_6px_rgba(34,34,34,0.16)] transition-transform duration-200",
                  field.value ? "translate-x-5" : "translate-x-0",
                )}
              />
            </span>
          </button>
        </FieldShell>
      )}
    />
  );
}

type ColorFieldProps<TFormValues extends FieldValues> = BaseFieldProps<TFormValues>;

export function ColorField<TFormValues extends FieldValues>({
  name,
  label,
  hint,
}: ColorFieldProps<TFormValues>) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<TFormValues>();
  const fieldError = get(errors, name)?.message;
  const colorValue = watch(name) as string | undefined;

  return (
    <FieldShell
      label={label}
      htmlFor={name}
      hint={hint}
      error={typeof fieldError === "string" ? fieldError : undefined}
    >
          <div className="flex items-center gap-3 rounded-lg border border-[var(--border-soft)] bg-white px-3.5 py-3.5">
        <input
          id={name}
          type="color"
          {...register(name)}
          className="h-11 w-14 cursor-pointer rounded-[0.8rem] border border-[var(--border-soft)] bg-transparent p-1"
        />
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">
            {colorValue || "#c69854"}
          </p>
          <p className="text-[0.75rem] leading-6 text-[var(--muted-foreground)]">
            Used for headers and highlights in the preview.
          </p>
        </div>
      </div>
    </FieldShell>
  );
}

type FileUploadFieldProps<TFormValues extends FieldValues> = BaseFieldProps<TFormValues>;

export function FileUploadField<TFormValues extends FieldValues>({
  name,
  label,
  hint,
}: FileUploadFieldProps<TFormValues>) {
  const { control, setError, clearErrors } = useFormContext<TFormValues>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <FieldShell
          label={label}
          hint={hint}
          error={fieldState.error?.message}
        >
          <div className="space-y-3 rounded-lg border border-[var(--border-soft)] bg-white p-4">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={async (event) => {
                const file = event.target.files?.[0];

                if (!file) {
                  field.onChange("");
                  clearErrors(name);
                  return;
                }

                const isValidType = [
                  "image/png",
                  "image/jpeg",
                  "image/webp",
                  "image/svg+xml",
                ].includes(file.type);

                if (!isValidType) {
                  setError(name, {
                    type: "manual",
                    message: "Upload PNG, JPG, WEBP, or SVG only.",
                  });
                  return;
                }

                if (file.size > 1_500_000) {
                  setError(name, {
                    type: "manual",
                    message: "Keep logo files under 1.5 MB.",
                  });
                  return;
                }

                const dataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result ?? ""));
                  reader.onerror = () => reject(reader.error);
                  reader.readAsDataURL(file);
                });

                clearErrors(name);
                field.onChange(dataUrl);
              }}
              className="block w-full text-[15px] text-[var(--foreground)] file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-[var(--surface-soft)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--foreground)] focus:ring-[var(--neutral-gray)]"
            />

            {field.value ? (
              <div className="flex items-center justify-between rounded-lg border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-3">
                <p className="text-[0.75rem] leading-6 text-[var(--foreground-soft)]">
                  Logo loaded into the current session preview.
                </p>
                <button
                  type="button"
                  onClick={() => field.onChange("")}
                  className="text-[0.75rem] font-medium text-[var(--foreground)] underline decoration-[var(--accent)] underline-offset-4"
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        </FieldShell>
      )}
    />
  );
}

type SliderFieldProps<TFormValues extends FieldValues> = BaseFieldProps<TFormValues> & {
  min: number;
  max: number;
  step?: number;
};

export function SliderField<TFormValues extends FieldValues>({
  name,
  label,
  hint,
  min,
  max,
  step = 1,
}: SliderFieldProps<TFormValues>) {
  const { control } = useFormContext<TFormValues>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FieldShell label={label} hint={hint}>
          <div className="flex items-center gap-4 py-2">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={typeof field.value === "number" ? field.value : min}
              onChange={(e) => field.onChange(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--border-soft)] accent-[var(--accent)] focus:outline-none"
            />
            <span className="min-w-[3.5rem] text-right text-sm font-medium text-[var(--foreground)]">
              {field.value ?? min}px
            </span>
          </div>
        </FieldShell>
      )}
    />
  );
}

type SegmentedControlFieldProps<TFormValues extends FieldValues> = BaseFieldProps<TFormValues> & {
  options: Array<{ value: string; label: string }>;
};

export function SegmentedControlField<TFormValues extends FieldValues>({
  name,
  label,
  hint,
  options,
}: SegmentedControlFieldProps<TFormValues>) {
  const { control } = useFormContext<TFormValues>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FieldShell label={label} hint={hint}>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-soft)] p-1">
            {options.map((option) => {
              const isActive = field.value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => field.onChange(option.value)}
                  className={cn(
                    "rounded-[0.5rem] py-2 text-center text-sm font-medium transition-all",
                    isActive
                      ? "bg-white text-[var(--foreground)] shadow-sm border border-[var(--border-soft)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </FieldShell>
      )}
    />
  );
}
