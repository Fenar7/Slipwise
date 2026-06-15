import { z } from "zod";

/**
 * Allowed visibility policy values for a mailbox connection.
 */
export const VISIBILITY_POLICY_VALUES = [
  "org_shared",
  "restricted",
  "admin_only",
] as const;

/**
 * Allowed mailbox provider values.
 */
export const MAILBOX_PROVIDER_VALUES = ["GMAIL", "ZOHO"] as const;

/**
 * Schema for notification settings — a JSON object with email and sms booleans.
 * Used to mask PII: only the boolean values are stored, never raw addresses.
 */
export const notificationSettingsSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
});

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

/**
 * Schema for PATCH /api/mailbox/connections/[connectionId].
 * All fields are optional; at least one must be provided.
 * Rejects unknown keys via .strip() — unknown keys cause parse failure.
 */
export const patchConnectionSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "displayName must not be empty")
      .max(100, "displayName must be at most 100 characters")
      .optional(),
    visibilityPolicy: z
      .enum(VISIBILITY_POLICY_VALUES)
      .optional(),
    notificationSettings: notificationSettingsSchema.optional(),
  })
  .strict("Unexpected fields in request body")
  .refine(
    (data) => data.displayName !== undefined || data.visibilityPolicy !== undefined || data.notificationSettings !== undefined,
    { message: "At least one field (displayName, visibilityPolicy, notificationSettings) must be provided" },
  );

export type PatchConnectionInput = z.infer<typeof patchConnectionSchema>;

/**
 * Schema for POST /api/mailbox/connections.
 * displayName is required and must be unique per org (enforced at service layer).
 */
export const createConnectionSchema = z
  .object({
    provider: z.enum(MAILBOX_PROVIDER_VALUES, {
      errorMap: () => ({ message: "provider must be one of: GMAIL, ZOHO" }),
    }),
    emailAddress: z.string().email("emailAddress must be a valid email"),
    displayName: z
      .string()
      .trim()
      .min(1, "displayName must not be empty")
      .max(100, "displayName must be at most 100 characters"),
    visibilityPolicy: z
      .enum(VISIBILITY_POLICY_VALUES)
      .optional()
      .default("org_shared"),
    notificationSettings: notificationSettingsSchema.optional(),
    providerAccountId: z.string().min(1, "providerAccountId is required"),
    tokenRef: z.string().min(1, "tokenRef is required"),
    tokenExpiry: z.string().datetime().optional().nullable(),
  })
  .strict("Unexpected fields in request body");

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

/**
* Schema for New Chat POST — empty body with strict mode (rejects any keys).
 */
export const newChatCreateSchema = z.object({}).strict("Request body must be empty for New Chat creation");

/**
 * Schema for cursor-based pagination query parameters.
 */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(
      z
        .number()
        .int("pageSize must be an integer")
        .min(1, "pageSize must be at least 1")
        .max(100, "pageSize must not exceed 100"),
    ),
});
