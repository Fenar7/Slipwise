import { describe, expect, it, vi } from "vitest";

// Bypass server-only guard
vi.mock("server-only", () => ({}));

// Mock the upload-server module
vi.mock("@/lib/storage/upload-server", () => ({
  uploadFileServer: vi.fn(),
  getSignedUrlServer: vi.fn(),
}));

import { uploadFileServer } from "@/lib/storage/upload-server";
import { uploadPaymentProofFile } from "../payment-proof-storage";

describe("uploadPaymentProofFile", () => {
  it("should upload file using admin privileges to bypass RLS", async () => {
    const orgId = "org-1";
    const invoiceId = "inv-1";
    const fileName = "test-proof.png";
    const file = new File(["dummy-content"], fileName, { type: "image/png" });

    await uploadPaymentProofFile({
      orgId,
      invoiceId,
      file,
      fileName,
    });

    expect(uploadFileServer).toHaveBeenCalledWith(
      "proofs",
      expect.stringContaining(`proofs/${orgId}/${invoiceId}/`),
      expect.any(Buffer),
      "image/png",
      { useAdmin: true },
    );
  });
});
