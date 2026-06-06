import "server-only";

import { getSignedUrlServer, uploadFileServer } from "@/lib/storage/upload-server";
import {
  buildPaymentProofStoragePath,
  isLegacyProofUrl,
} from "@/features/pay/lib/payment-proof";

export async function resolvePaymentProofUrl(fileReference: string): Promise<string> {
  if (isLegacyProofUrl(fileReference)) {
    return fileReference;
  }

  return getSignedUrlServer("proofs", fileReference, 3600, { useAdmin: true });
}

export async function uploadPaymentProofFile(input: {
  orgId: string;
  invoiceId: string;
  file: File;
  fileName?: string;
}) {
  const resolvedFileName = input.fileName?.trim() || input.file.name;

  return uploadFileServer(
    "proofs",
    buildPaymentProofStoragePath(input.orgId, input.invoiceId, resolvedFileName),
    Buffer.from(await input.file.arrayBuffer()),
    input.file.type || "application/octet-stream",
  );
}
