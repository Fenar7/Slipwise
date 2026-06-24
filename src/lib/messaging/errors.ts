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

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidInputError);
    }
    Object.setPrototypeOf(this, InvalidInputError.prototype);
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotFoundError);
    }
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class MessagingAccessContextError extends Error {
  constructor(message = "Messaging access context resolution failed") {
    super(message);
    this.name = "MessagingAccessContextError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MessagingAccessContextError);
    }
    Object.setPrototypeOf(this, MessagingAccessContextError.prototype);
  }
}
