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

/**
 * Structured error indicating invalid input parameters.
 */
export class InvalidInputError extends Error {
  constructor(message = "Invalid input") {
    super(message);
    this.name = "InvalidInputError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidInputError);
    }
    Object.setPrototypeOf(this, InvalidInputError.prototype);
  }
}

/**
 * Structured error indicating a requested resource was not found.
 */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotFoundError);
    }
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
