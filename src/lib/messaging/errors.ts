import "server-only";

/**
 * Structured error indicating that the requesting user lacks active participant access
 * to the conversation.
 */
export class ConversationAccessError extends Error {
  constructor(message = "active participant access required") {
    super(message);
    this.name = "ConversationAccessError";
    // Maintain proper stack trace and prototype chain
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConversationAccessError);
    }
    Object.setPrototypeOf(this, ConversationAccessError.prototype);
  }
}
