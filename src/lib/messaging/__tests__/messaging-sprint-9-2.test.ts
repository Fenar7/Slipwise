import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock db client
vi.mock("@/lib/db", () => {
  const mocks = {
    conversationParticipant: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversationMessage: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    messagingTask: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversationMeeting: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversationAttachment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    messagingAttachmentIndex: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    downstreamConsumptionCheckpoint: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    conversationEventLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: any) => cb(db)),
  };
  return { db };
});

// Mock downloadFileServer
vi.mock("@/lib/storage/upload-server", () => ({
  downloadFileServer: vi.fn().mockResolvedValue(new TextEncoder().encode("mock file content with target query")),
}));

// Mock pdfjs-dist dependency
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => {
  const mockPage = {
    getTextContent: vi.fn().mockResolvedValue({
      items: [{ str: "extracted pdf target content" }],
    }),
    cleanup: vi.fn(),
  };
  const mockPdf = {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue(mockPage),
    destroy: vi.fn(),
  };
  return {
    getDocument: vi.fn().mockReturnValue({
      promise: Promise.resolve(mockPdf),
    }),
  };
});

import { db } from "@/lib/db";
import { downloadFileServer } from "@/lib/storage/upload-server";
import { indexAttachment, processSearchIndexEvents, updateAttachmentScanStatus } from "../indexing-service";
import { searchMessaging } from "../search-service";
const AttachmentScanStatus = {
  PENDING: "PENDING",
  CLEAN: "CLEAN",
  BLOCKED: "BLOCKED",
} as const;

const AttachmentIndexingStatus = {
  PENDING: "PENDING",
  INDEXED: "INDEXED",
  UNINDEXED: "UNINDEXED",
  FAILED: "FAILED",
} as const;

describe("Sprint 9.2 — Full File Search & Attachment Indexing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FILE_INDEXING_DISABLED;
    vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([]);
    vi.mocked(db.conversationMessage.findMany).mockResolvedValue([]);
    vi.mocked(db.conversation.findMany).mockResolvedValue([]);
    vi.mocked(db.messagingTask.findMany).mockResolvedValue([]);
    vi.mocked(db.conversationMeeting.findMany).mockResolvedValue([]);
    vi.mocked(db.messagingAttachmentIndex.findMany).mockResolvedValue([]);
    vi.mocked(db.downstreamConsumptionCheckpoint.findUnique).mockResolvedValue(null);
    vi.mocked(db.conversationEventLog.findMany).mockResolvedValue([]);

    vi.mocked(db.conversationParticipant.count).mockResolvedValue(0);
    vi.mocked(db.conversationMessage.count).mockResolvedValue(0);
    vi.mocked(db.conversation.count).mockResolvedValue(0);
    vi.mocked(db.messagingTask.count).mockResolvedValue(0);
    vi.mocked(db.conversationMeeting.count).mockResolvedValue(0);
    vi.mocked(db.conversationAttachment.count).mockResolvedValue(0);
    vi.mocked(db.messagingAttachmentIndex.count).mockResolvedValue(0);
  });

  describe("Safe Indexing Rules (indexAttachment)", () => {
    it("stores PENDING scan status files with PENDING indexing status and empty text", async () => {
      vi.mocked(db.conversationAttachment.findUnique).mockResolvedValue({
        id: "att-1",
        orgId: "org-1",
        messageId: "msg-1",
        storageRef: "ref-1",
        fileName: "pending.txt",
        mimeType: "text/plain",
        sizeBytes: 100,
        scanStatus: AttachmentScanStatus.PENDING,
        createdAt: new Date(),
        message: { conversationId: "conv-1" },
      } as any);

      await indexAttachment("att-1");

      expect(db.messagingAttachmentIndex.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { attachmentId: "att-1" },
          create: expect.objectContaining({
            fileName: "pending.txt",
            scanStatus: AttachmentScanStatus.PENDING,
            indexingStatus: AttachmentIndexingStatus.PENDING,
            extractedText: "",
          }),
        })
      );
      expect(downloadFileServer).not.toHaveBeenCalled();
    });

    it("stores BLOCKED scan status files with UNINDEXED status and blocked text/message", async () => {
      vi.mocked(db.conversationAttachment.findUnique).mockResolvedValue({
        id: "att-2",
        orgId: "org-1",
        messageId: "msg-1",
        storageRef: "ref-2",
        fileName: "blocked.exe",
        mimeType: "application/octet-stream",
        sizeBytes: 100,
        scanStatus: AttachmentScanStatus.BLOCKED,
        createdAt: new Date(),
        message: { conversationId: "conv-1" },
      } as any);

      await indexAttachment("att-2");

      expect(db.messagingAttachmentIndex.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            scanStatus: AttachmentScanStatus.BLOCKED,
            indexingStatus: AttachmentIndexingStatus.UNINDEXED,
            extractedText: "",
            extractedPreview: "[Blocked due to security policy]",
          }),
        })
      );
      expect(downloadFileServer).not.toHaveBeenCalled();
    });

    it("stores unsupported mime types as UNINDEXED without downloading", async () => {
      vi.mocked(db.conversationAttachment.findUnique).mockResolvedValue({
        id: "att-3",
        orgId: "org-1",
        messageId: "msg-1",
        storageRef: "ref-3",
        fileName: "image.png",
        mimeType: "image/png",
        sizeBytes: 200,
        scanStatus: AttachmentScanStatus.CLEAN,
        createdAt: new Date(),
        message: { conversationId: "conv-1" },
      } as any);

      await indexAttachment("att-3");

      expect(db.messagingAttachmentIndex.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            scanStatus: AttachmentScanStatus.CLEAN,
            indexingStatus: AttachmentIndexingStatus.UNINDEXED,
            extractedText: "",
          }),
        })
      );
      expect(downloadFileServer).not.toHaveBeenCalled();
    });

    it("downloads and indexes text/plain and text/csv files", async () => {
      vi.mocked(db.conversationAttachment.findUnique).mockResolvedValue({
        id: "att-4",
        orgId: "org-1",
        messageId: "msg-1",
        storageRef: "ref-4",
        fileName: "data.csv",
        mimeType: "text/csv",
        sizeBytes: 200,
        scanStatus: AttachmentScanStatus.CLEAN,
        createdAt: new Date(),
        message: { conversationId: "conv-1" },
      } as any);

      await indexAttachment("att-4");

      expect(downloadFileServer).toHaveBeenCalledWith("attachments", "ref-4", { useAdmin: true });
      expect(db.messagingAttachmentIndex.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            indexingStatus: AttachmentIndexingStatus.INDEXED,
            extractedText: "mock file content with target query",
          }),
        })
      );
    });

    it("parses and indexes application/pdf files using pdfjs-dist", async () => {
      vi.mocked(db.conversationAttachment.findUnique).mockResolvedValue({
        id: "att-5",
        orgId: "org-1",
        messageId: "msg-1",
        storageRef: "ref-5",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 500,
        scanStatus: AttachmentScanStatus.CLEAN,
        createdAt: new Date(),
        message: { conversationId: "conv-1" },
      } as any);

      await indexAttachment("att-5");

      expect(db.messagingAttachmentIndex.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            indexingStatus: AttachmentIndexingStatus.INDEXED,
            extractedText: "extracted pdf target content\n",
          }),
        })
      );
    });
  });

  describe("File Search Visibility & Query Constraints", () => {
    it("only returns file results from conversations the user is authorized to access", async () => {
      // User belongs to conv-1 but not conv-2
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conv-1", orgId: "org-1", userId: "user-1", leftAt: null },
      ] as any);

      // Mock database matching records
      vi.mocked(db.messagingAttachmentIndex.findMany).mockResolvedValue([
        {
          id: "index-1",
          orgId: "org-1",
          attachmentId: "att-1",
          messageId: "msg-1",
          conversationId: "conv-1",
          fileName: "matching-file.txt",
          mimeType: "text/plain",
          scanStatus: AttachmentScanStatus.CLEAN,
          indexingStatus: AttachmentIndexingStatus.INDEXED,
          extractedText: "some content matching query",
          lastIndexedAt: new Date(),
          attachment: { sizeBytes: 150 },
        },
      ] as any);

      vi.mocked(db.conversation.findMany).mockResolvedValue([
        { id: "conv-1", name: "general" },
      ] as any);

      vi.mocked(db.messagingAttachmentIndex.count).mockResolvedValueOnce(1); // fileCount
      vi.mocked(db.conversationAttachment.count).mockResolvedValueOnce(0); // pendingScanCount
      vi.mocked(db.messagingAttachmentIndex.count).mockResolvedValueOnce(0); // unindexedCount
      vi.mocked(db.conversationAttachment.count).mockResolvedValueOnce(1); // totalAttachmentCount
      vi.mocked(db.messagingAttachmentIndex.count).mockResolvedValueOnce(1); // indexedAttachmentCount

      const response = await searchMessaging("org-1", "user-1", {
        q: "matching",
        kinds: ["file"],
      });

      // Assert conversationParticipant filter was applied
      expect(db.messagingAttachmentIndex.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: { in: ["conv-1"] },
          }),
        })
      );

      expect(response.results.length).toBe(1);
      expect(response.results[0].title).toBe("matching-file.txt");
      expect(response.state).toBe("active");
    });

    it("ranks exact filename matches higher than content-only matches", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conv-1", orgId: "org-1", userId: "user-1", leftAt: null },
      ] as any);

      // We have one filename match, and one content match
      vi.mocked(db.messagingAttachmentIndex.findMany).mockResolvedValue([
        {
          id: "index-content",
          orgId: "org-1",
          attachmentId: "att-content",
          messageId: "msg-1",
          conversationId: "conv-1",
          fileName: "other-file.txt",
          mimeType: "text/plain",
          scanStatus: AttachmentScanStatus.CLEAN,
          indexingStatus: AttachmentIndexingStatus.INDEXED,
          extractedText: "exactmatchingquery text",
          lastIndexedAt: new Date("2026-01-01"),
          attachment: { sizeBytes: 100 },
        },
        {
          id: "index-filename",
          orgId: "org-1",
          attachmentId: "att-filename",
          messageId: "msg-1",
          conversationId: "conv-1",
          fileName: "exactmatchingquery.txt",
          mimeType: "text/plain",
          scanStatus: AttachmentScanStatus.CLEAN,
          indexingStatus: AttachmentIndexingStatus.INDEXED,
          extractedText: "other text contents",
          lastIndexedAt: new Date("2026-01-01"),
          attachment: { sizeBytes: 200 },
        },
      ] as any);

      vi.mocked(db.conversation.findMany).mockResolvedValue([
        { id: "conv-1", name: "general" },
      ] as any);

      const response = await searchMessaging("org-1", "user-1", {
        q: "exactmatchingquery",
        kinds: ["file"],
      });

      // Filename match should be sorted first (highest score)
      expect(response.results.length).toBe(2);
      expect(response.results[0].id).toBe("index-filename");
      expect(response.results[1].id).toBe("index-content");
    });

    it("never exposes snippets or extracted text for blocked files", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conv-1", orgId: "org-1", userId: "user-1", leftAt: null },
      ] as any);

      vi.mocked(db.messagingAttachmentIndex.findMany).mockResolvedValue([
        {
          id: "index-blocked",
          orgId: "org-1",
          attachmentId: "att-blocked",
          messageId: "msg-1",
          conversationId: "conv-1",
          fileName: "malicious.csv",
          mimeType: "text/csv",
          scanStatus: AttachmentScanStatus.BLOCKED,
          indexingStatus: AttachmentIndexingStatus.UNINDEXED,
          extractedText: "",
          lastIndexedAt: new Date(),
          attachment: { sizeBytes: 300 },
        },
      ] as any);

      const response = await searchMessaging("org-1", "user-1", {
        q: "malicious",
        kinds: ["file"],
      });

      expect(response.results[0].snippet).toBe("[Blocked due to security policy]");
    });

    it("truthfully reports pending scan and unsupported files state flags", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conv-1", orgId: "org-1", userId: "user-1", leftAt: null },
      ] as any);

      vi.mocked(db.messagingAttachmentIndex.findMany).mockResolvedValue([]);
      
      // Let's mock count queries:
      // pendingScanCount > 0 -> hasPendingScans: true
      vi.mocked(db.conversationAttachment.count).mockResolvedValueOnce(3); // totalAttachmentCount
      vi.mocked(db.conversationAttachment.count).mockResolvedValueOnce(1); // pendingScanCount
      
      // unindexedCount > 0 -> hasUnsupportedFiles: true
      vi.mocked(db.messagingAttachmentIndex.count).mockResolvedValueOnce(0); // fileCount
      vi.mocked(db.messagingAttachmentIndex.count).mockResolvedValueOnce(1); // unindexedCount
      vi.mocked(db.messagingAttachmentIndex.count).mockResolvedValueOnce(2); // indexedAttachmentCount

      const response = await searchMessaging("org-1", "user-1", {
        q: "anything",
        kinds: ["file"],
      });

      expect(response.state).toBe("partial");
      expect(response.hasPendingScans).toBe(true);
      expect(response.hasUnsupportedFiles).toBe(true);
    });
  });

  describe("Durable Indexing & Scan Status Transitions", () => {
    it("processes search index events durably and updates checkpoints", async () => {
      // Setup mock events
      const mockEvent = {
        eventId: "event-1",
        cursor: BigInt(123),
        eventType: "conversation.message.created",
        orgId: "org-1",
        conversationId: "conv-1",
        actorId: "user-1",
        createdAt: new Date(),
        payload: { messageId: "msg-1" },
      };

      vi.mocked(db.conversationEventLog.findMany).mockResolvedValue([mockEvent] as any);
      vi.mocked(db.conversationAttachment.findMany).mockResolvedValue([
        { id: "att-event-1" },
      ] as any);
      vi.mocked(db.conversationAttachment.findUnique).mockResolvedValue({
        id: "att-event-1",
        orgId: "org-1",
        messageId: "msg-1",
        storageRef: "ref-event-1",
        fileName: "file.txt",
        mimeType: "text/plain",
        sizeBytes: 100,
        scanStatus: AttachmentScanStatus.CLEAN,
        message: { conversationId: "conv-1" },
      } as any);

      await processSearchIndexEvents("org-1", "conv-1");

      // Verify indexing was triggered
      expect(db.messagingAttachmentIndex.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { attachmentId: "att-event-1" },
          create: expect.objectContaining({
            fileName: "file.txt",
            indexingStatus: AttachmentIndexingStatus.INDEXED,
          }),
        })
      );

      // Verify consumption checkpoint was updated
      expect(db.downstreamConsumptionCheckpoint.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            consumerType_orgId_conversationId: {
              consumerType: "search_index",
              orgId: "org-1",
              conversationId: "conv-1",
            },
          },
          update: expect.objectContaining({
            cursor: BigInt(123),
          }),
        })
      );
    });

    it("re-indexes file when moving from PENDING to CLEAN and clears extracted text when transitioning to BLOCKED", async () => {
      // 1. Transition PENDING -> CLEAN
      vi.mocked(db.conversationAttachment.findUnique).mockResolvedValue({
        id: "att-transition-1",
        orgId: "org-1",
        messageId: "msg-1",
        storageRef: "ref-transition-1",
        fileName: "data.txt",
        mimeType: "text/plain",
        sizeBytes: 200,
        scanStatus: AttachmentScanStatus.CLEAN,
        message: { conversationId: "conv-1" },
      } as any);

      await updateAttachmentScanStatus("org-1", "att-transition-1", AttachmentScanStatus.CLEAN);

      expect(db.conversationAttachment.update).toHaveBeenCalledWith({
        where: { id: "att-transition-1", orgId: "org-1" },
        data: { scanStatus: AttachmentScanStatus.CLEAN },
      });

      expect(db.messagingAttachmentIndex.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            scanStatus: AttachmentScanStatus.CLEAN,
            indexingStatus: AttachmentIndexingStatus.INDEXED,
            extractedText: "mock file content with target query",
          }),
        })
      );

      // 2. Transition CLEAN -> BLOCKED
      vi.mocked(db.conversationAttachment.findUnique).mockResolvedValue({
        id: "att-transition-1",
        orgId: "org-1",
        messageId: "msg-1",
        storageRef: "ref-transition-1",
        fileName: "data.txt",
        mimeType: "text/plain",
        sizeBytes: 200,
        scanStatus: AttachmentScanStatus.BLOCKED,
        message: { conversationId: "conv-1" },
      } as any);

      await updateAttachmentScanStatus("org-1", "att-transition-1", AttachmentScanStatus.BLOCKED);

      expect(db.messagingAttachmentIndex.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            scanStatus: AttachmentScanStatus.BLOCKED,
            indexingStatus: AttachmentIndexingStatus.UNINDEXED,
            extractedText: "", // extracted text must be removed
            extractedPreview: "[Blocked due to security policy]",
          }),
        })
      );
    });
  });

  describe("PDF Indexing Resource Hardening Limits", () => {
    it("handles oversized PDF truthfully without downloading and sets FAILED size limit exceeded", async () => {
      vi.mocked(db.conversationAttachment.findUnique).mockResolvedValue({
        id: "att-oversized",
        orgId: "org-1",
        messageId: "msg-1",
        storageRef: "ref-oversized",
        fileName: "huge.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10 * 1024 * 1024, // 10MB (exceeds 5MB limit)
        scanStatus: AttachmentScanStatus.CLEAN,
        message: { conversationId: "conv-1" },
      } as any);

      await indexAttachment("att-oversized");

      // Verify download was not called
      expect(downloadFileServer).not.toHaveBeenCalled();

      // Verify indexing marked as FAILED with size reason
      expect(db.messagingAttachmentIndex.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            indexingStatus: AttachmentIndexingStatus.FAILED,
            lastError: "File size limit exceeded",
            extractedText: "",
          }),
        })
      );
    });

    it("handles excessive page count PDF truthfully and sets FAILED page count limit exceeded", async () => {
      vi.mocked(db.conversationAttachment.findUnique).mockResolvedValue({
        id: "att-many-pages",
        orgId: "org-1",
        messageId: "msg-1",
        storageRef: "ref-many-pages",
        fileName: "verbose.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100 * 1024, // 100KB (below size limit)
        scanStatus: AttachmentScanStatus.CLEAN,
        message: { conversationId: "conv-1" },
      } as any);

      // Mock pdfjs-dist getDocument to return a PDF with 20 pages (exceeds 10 page limit)
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const mockPdfDestroy = vi.fn();
      vi.mocked(pdfjsLib.getDocument).mockReturnValueOnce({
        promise: Promise.resolve({
          numPages: 20,
          getPage: vi.fn(),
          destroy: mockPdfDestroy,
        }),
      } as any);

      await indexAttachment("att-many-pages");

      // Verify page parser was not called (because page count check triggers error first)
      expect(mockPdfDestroy).toHaveBeenCalled();

      // Verify indexing marked as FAILED with page count reason
      expect(db.messagingAttachmentIndex.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            indexingStatus: AttachmentIndexingStatus.FAILED,
            lastError: "Page count limit exceeded",
            extractedText: "",
          }),
        })
      );
    });
  });
});
