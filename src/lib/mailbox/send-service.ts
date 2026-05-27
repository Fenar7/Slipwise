import "server-only";

export class SendServiceError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "SendServiceError";
  }
}

export async function reconcileSendAttempt(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  attemptId: string;
}) {
  return {
    status: "still_pending" as const,
    message: "Pending reconciliation",
  };
}
