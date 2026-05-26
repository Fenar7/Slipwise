import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MessagingMessageActions } from "../messaging-message-actions";
import { MessagingTaskCreate } from "../messaging-task-create";

describe("Sprint 6.6 Frontend — Create task from message & reminders", () => {
  describe("MessagingMessageActions", () => {
    it("renders Create task action when onCreateTask is provided", () => {
      const onCreateTask = vi.fn();
      render(
        <MessagingMessageActions
          onClose={vi.fn()}
          onCreateTask={onCreateTask}
        />
      );

      expect(screen.getByTestId("msg-action-create-task")).toBeInTheDocument();
    });

    it("does not render Create task action when onCreateTask is omitted", () => {
      render(<MessagingMessageActions onClose={vi.fn()} />);
      expect(screen.queryByTestId("msg-action-create-task")).not.toBeInTheDocument();
    });

    it("calls onCreateTask and onClose when Create task is clicked", () => {
      const onCreateTask = vi.fn();
      const onClose = vi.fn();
      render(
        <MessagingMessageActions
          onClose={onClose}
          onCreateTask={onCreateTask}
        />
      );

      fireEvent.click(screen.getByTestId("msg-action-create-task"));
      expect(onCreateTask).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("MessagingTaskCreate — originating message context", () => {
    it("renders originating message preview when provided", () => {
      render(
        <MessagingTaskCreate
          onClose={vi.fn()}
          conversationId="conv-1"
          originatingMessageId="msg-1"
          originatingMessagePreview="This is the message preview…"
        />
      );

      expect(screen.getByTestId("task-create-origin-preview")).toBeInTheDocument();
      expect(screen.getByText("This is the message preview…")).toBeInTheDocument();
    });

    it("does not render originating message preview when not provided", () => {
      render(
        <MessagingTaskCreate
          onClose={vi.fn()}
          conversationId="conv-1"
        />
      );

      expect(screen.queryByTestId("task-create-origin-preview")).not.toBeInTheDocument();
    });

    it("renders reminder datetime input", () => {
      render(
        <MessagingTaskCreate
          onClose={vi.fn()}
          conversationId="conv-1"
        />
      );

      expect(screen.getByTestId("task-reminder-at")).toBeInTheDocument();
    });
  });
});
