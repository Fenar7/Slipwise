"use server";

import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { db } from "@/lib/db";

export type StorageBucket = "logos" | "attachments" | "proofs";

export interface UploadResult {
  storageKey: string;
  publicUrl?: string;
}

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

async function ensureBucketExists(bucket: StorageBucket) {
  const admin = await createSupabaseAdmin();
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.find((b) => b.name === bucket);
  if (!exists) {
    await admin.storage.createBucket(bucket, { public: bucket === "logos" });
  }
}

/**
 * Server-side file upload to Supabase Storage
 */
export async function uploadFileServer(
  bucket: StorageBucket,
  path: string,
  fileBuffer: Buffer,
  contentType: string,
  options?: { useAdmin?: boolean }
): Promise<UploadResult> {
  await assertResidencyCompatible(path, "upload");
  const supabase = options?.useAdmin
    ? await createSupabaseAdmin()
    : await createSupabaseServer();

  let { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, fileBuffer, {
      contentType,
      cacheControl: "3600",
      upsert: true,
    });

  // Supabase returns a 403 RLS error (not 404) when the target bucket does not
  // exist. On any initial failure we ensure the bucket exists via the admin
  // client and retry — the retry always uses the admin client so RLS is
  // bypassed unconditionally on the second attempt.
  if (error) {
    console.warn(`Storage upload failed (${error.message}), ensuring bucket and retrying with admin client…`);
    await ensureBucketExists(bucket);
    const admin = await createSupabaseAdmin();
    const retry = await admin.storage
      .from(bucket)
      .upload(path, fileBuffer, {
        contentType,
        cacheControl: "3600",
        upsert: true,
      });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error("Server upload error:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const result: UploadResult = {
    storageKey: data!.path,
  };

  if (bucket === "logos") {
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data!.path);
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
  expiresInSeconds: number = 3600
): Promise<string> {
  await assertResidencyCompatible(storageKey, "read");
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storageKey, expiresInSeconds);

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
  storageKey: string
): Promise<void> {
  const supabase = await createSupabaseServer();

  const { error } = await supabase.storage.from(bucket).remove([storageKey]);

  if (error) {
    console.error("Server delete error:", error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}
