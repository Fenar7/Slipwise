/* eslint-disable @typescript-eslint/no-explicit-any -- test setup: dynamically patches db client models for test isolation, requires `any` for runtime augmentation */
import { db } from "@/lib/db";
import { vi, beforeEach } from "vitest";

beforeEach(() => {
  if (db && typeof db === "object") {
    // 1. Mock member model
    if (!("member" in db)) {
      (db as any).member = {};
    }
    const member = (db as any).member;

    const setupMock = (fnName: string, defaultImpl: (...args: any[]) => any) => {
      const existing = member[fnName];
      if (!existing) {
        member[fnName] = vi.fn().mockImplementation(defaultImpl as any);
      } else if (
        typeof existing.mockImplementation === "function" &&
        typeof existing.getMockImplementation === "function" &&
        !existing.getMockImplementation()
      ) {
        existing.mockImplementation(defaultImpl as any);
      }
    };

    setupMock("findMany", async (args: any) => {
      const orList = args?.where?.OR;
      if (Array.isArray(orList)) {
        return orList.map((item: any) => ({
          userId: item.userId ?? "user-1",
          organizationId: item.organizationId ?? "org-aaa",
          role: "MEMBER",
        }));
      }
      const userIds = args?.where?.userId?.in || (args?.where?.userId ? [args.where.userId] : []);
      return userIds.map((userId: string) => ({
        userId,
        organizationId: args?.where?.organizationId ?? "org-aaa",
        role: "MEMBER",
      }));
    });

    setupMock("findFirst", async (args: any) => {
      const userId = args?.where?.userId ?? "user-1";
      const orgId = args?.where?.organizationId ?? "org-aaa";
      return {
        userId,
        organizationId: orgId,
        role: "MEMBER",
        customRole: null,
      };
    });

    setupMock("findUnique", async (args: any) => {
      const orgUserId = args?.where?.organizationId_userId;
      const userId = orgUserId?.userId ?? args?.where?.userId ?? "user-1";
      const orgId = orgUserId?.organizationId ?? args?.where?.organizationId ?? "org-aaa";
      return {
        userId,
        organizationId: orgId,
        role: "MEMBER",
        customRole: null,
      };
    });

    setupMock("create", async () => ({}));
    setupMock("update", async () => ({}));

    // 2. Mock conversationEventLog model
    if (!("conversationEventLog" in db)) {
      (db as any).conversationEventLog = {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      };
    }

    // 3. Make sure messageMention.findMany returns an empty array by default
    if ("messageMention" in db) {
      const mention = (db as any).messageMention;
      if (mention && mention.findMany && typeof mention.findMany.mockImplementation === "function" && !mention.findMany.getMockImplementation()) {
        mention.findMany.mockImplementation(async () => {
          return [];
        });
      }
    } else {
      (db as any).messageMention = {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      };
    }

    // 4. Make sure messageReaction.findMany returns an empty array by default if it exists and is a mock
    if ("messageReaction" in db) {
      const rx = (db as any).messageReaction;
      if (rx && rx.findMany && typeof rx.findMany.mockImplementation === "function" && !rx.findMany.getMockImplementation()) {
        rx.findMany.mockImplementation(async () => {
          return [];
        });
      }
    } else {
      (db as any).messageReaction = {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      };
    }

    // 5. Make sure conversationAttachment.findMany returns an empty array by default if it exists and is a mock
    if ("conversationAttachment" in db) {
      const att = (db as any).conversationAttachment;
      if (att && att.findMany && typeof att.findMany.mockImplementation === "function" && !att.findMany.getMockImplementation()) {
        att.findMany.mockImplementation(async () => {
          return [];
        });
      }
    } else {
      (db as any).conversationAttachment = {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      };
    }
  }
});
