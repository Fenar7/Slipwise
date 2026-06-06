"use server";

import { createSupabaseAdmin, createSupabaseServer } from "@/lib/supabase/server";
import { db } from "@/lib/db";

export type StorageBucket = "logos" | "attachments" | "proofs";

export interface UploadResult {
  storageKey: string;
  publicUrl?: string;
}

type StorageClientOptions = {
  useAdmin?: boolean;
};

function extractOrgIdFromStorageKey(storageKey: string): string | null {
  const [orgId] = storageKey.split("/");
  return orgId?.trim() || null;
}

async function assertResidencyCompatible(
  storageKey: string,
  operation: "upload" | "read",
): Promise<void> {
  const orgId = extractOrgIdFromStorageKey(storageKey);
  if (!orgId) {
    return;
  }

  const residency = await db.dataResidencyConfig.findUnique({
    where: { orgId },
    select: { enforced: true, region: true },
  });

  if (!residency?.enforced) {
    return;
  }

  if (process.env.STORAGE_PROVIDER === "s3") {
    return;
  }

  throw new Error(
    `Data residency is enforced for this organisation (${residency.region}). Configure region-aware S3 storage before ${operation === "upload" ? "uploading new files" : "issuing file access URLs"}.`,
  );
}

/**
 * Server-side file upload to Supabase Storage
 */
async function getStorageClient(options?: StorageClientOptions) {
  return options?.useAdmin ? createSupabaseAdmin() : createSupabaseServer();
}

function isMissingBucketError(error: unknown): error is { message?: string; statusCode?: string | number } {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { message?: string; statusCode?: string | number };
  return candidate.message === "Bucket not found" || candidate.statusCode === "404";
}

async function ensureBucketExists(bucket: StorageBucket): Promise<void> {
  const admin = await createSupabaseAdmin();
  const { data: existing, error: listError } = await admin.storage.listBuckets();

  if (listError) {
    console.error("Storage list buckets error:", listError);
    throw new Error(`Failed to verify storage bucket: ${listError.message}`);
  }

  if (existing?.some((entry) => entry.name === bucket)) {
    return;
  }

  const { error: createError } = await admin.storage.createBucket(bucket, {
    public: bucket === "logos",
    fileSizeLimit: bucket === "logos" ? "2MB" : "10MB",
    allowedMimeTypes:
      bucket === "logos"
        ? ["image/png", "image/jpeg", "image/svg+xml", "image/webp"]
        : ["image/png", "image/jpeg", "image/pdf", "application/pdf"],
  });

  if (createError && createError.message !== "The resource already exists") {
    console.error("Storage create bucket error:", createError);
    throw new Error(`Failed to create storage bucket: ${createError.message}`);
  }
}

export async function uploadFileServer(
  bucket: StorageBucket,
  path: string,
  fileBuffer: Buffer,
  contentType: string,
  options?: StorageClientOptions,
): Promise<UploadResult> {
  await assertResidencyCompatible(path, "upload");
  let supabase = await getStorageClient(options);

  let { data, error } = await supabase.storage.from(bucket).upload(path, fileBuffer, {
    contentType,
    cacheControl: "3600",
    upsert: true,
  });

  if (isMissingBucketError(error)) {
    await ensureBucketExists(bucket);
    supabase = await getStorageClient({ ...options, useAdmin: true });
    ({ data, error } = await supabase.storage.from(bucket).upload(path, fileBuffer, {
      contentType,
      cacheControl: "3600",
      upsert: true,
    }));
  }

  if (error) {
    console.error("Server upload error:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const result: UploadResult = {
    storageKey: data.path,
  };

  if (bucket === "logos") {
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);
    result.publicUrl = urlData.publicUrl;
  }

  return result;
}

/**
 * Server-side signed URL generation
 */
export async function getSignedUrlServer(
  bucket: StorageBucket,
  storageKey: string,
  expiresInSeconds: number = 3600,
  options?: StorageClientOptions & { download?: boolean | string },
): Promise<string> {
  await assertResidencyCompatible(storageKey, "read");
  const supabase = await getStorageClient(options);

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storageKey, expiresInSeconds, {
      download: options?.download,
    });

  if (error) {
    console.error("Server signed URL error:", error);
    throw new Error(`Failed to get signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Server-side file deletion
 */
export async function deleteFileServer(
  bucket: StorageBucket,
  storageKey: string,
  options?: StorageClientOptions,
): Promise<void> {
  const supabase = await getStorageClient(options);

  const { error } = await supabase.storage.from(bucket).remove([storageKey]);

  if (error) {
    console.error("Server delete error:", error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

export async function downloadFileServer(
  bucket: StorageBucket,
  storageKey: string,
  options?: StorageClientOptions,
): Promise<Uint8Array> {
  await assertResidencyCompatible(storageKey, "read");
  const supabase = await getStorageClient(options);

  const { data, error } = await supabase.storage.from(bucket).download(storageKey);

  if (error || !data) {
    console.error("Server download error:", error);
    throw new Error(`Failed to download file: ${error?.message ?? "Unknown storage error"}`);
  }

  return new Uint8Array(await data.arrayBuffer());
}

export async function fileExistsServer(
  bucket: StorageBucket,
  storageKey: string,
  options?: StorageClientOptions,
): Promise<boolean> {
  try {
    await assertResidencyCompatible(storageKey, "read");
    const supabase = await getStorageClient(options);
    const { error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storageKey, 1);

    if (error) {
      const message = error.message?.toLowerCase() ?? "";
      if (
        message.includes("not found") ||
        message.includes("object not found") ||
        message.includes("404")
      ) {
        return false;
      }
      console.error("Server file existence check error:", error);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
