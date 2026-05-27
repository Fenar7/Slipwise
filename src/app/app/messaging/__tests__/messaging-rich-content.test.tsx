"use client";

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

import { MentionText } from "../messaging-mention-text";
import { MessagingComposer } from "../messaging-composer";
import { MessagingThreadPanel } from "../messaging-thread-panel";

describe("Phase 6 - Messaging Rich Content Rendering", () => {
  it("renders basic bold text formatted in strong element", () => {
    const { container } = render(<MentionText text="Hello **world** bold text" />);
    const strong = container.querySelector("strong");
    expect(strong).toBeInTheDocument();
    expect(strong?.textContent).toBe("world");
  });

  it("renders basic italic text formatted in em element", () => {
    const { container } = render(<MentionText text="Hello *world* italic text" />);
    const em = container.querySelector("em");
    expect(em).toBeInTheDocument();
    expect(em?.textContent).toBe("world");
  });

  it("renders basic strikethrough text formatted in del element", () => {
    const { container } = render(<MentionText text="Hello ~~world~~ strike text" />);
    const del = container.querySelector("del");
    expect(del).toBeInTheDocument();
    expect(del?.textContent).toBe("world");
  });

  it("renders inline code formatted in code element", () => {
    const { container } = render(<MentionText text="Hello `world` code text" />);
    const code = container.querySelector("code");
    expect(code).toBeInTheDocument();
    expect(code?.textContent).toBe("world");
  });

  it("renders bullet list items", () => {
    render(<MentionText text={"Hello\n- First item\n- Second item"} />);
    expect(screen.getByTestId("message-bullet-list")).toBeInTheDocument();
  });

  it("renders sanitized links in anchor elements", () => {
    const { container } = render(<MentionText text="Check [Google](https://google.com)" />);
    const link = container.querySelector("a");
    expect(link).toBeInTheDocument();
    expect(link?.getAttribute("href")).toBe("https://google.com");
    expect(link?.textContent).toBe("Google");
  });

  it("rejects unsafe links and renders them as plain text", () => {
    const { container } = render(<MentionText text="Click [Insecure](javascript:alert(1))" />);
    expect(container.querySelector("a")).not.toBeInTheDocument();
    expect(container.textContent).toContain("[Insecure](javascript:alert(1))");
  });

  it("preserves mentions highlights inside complex formatted texts", () => {
    render(<MentionText text={"Hey @Priya Sharma please look at **this list**:\n- Done"} />);
    expect(screen.getByTestId("message-mention")).toBeInTheDocument();
    expect(screen.getByTestId("message-mention").textContent).toBe("@Priya Sharma");
    expect(screen.getByTestId("message-bullet-list")).toBeInTheDocument();
  });

  it("does not render raw HTML tags and escapes them securely (XSS Protection)", () => {
    const { container } = render(
      <MentionText text="Hello <script>alert('xss')</script> <img src='x' onerror='alert(2)' /> text" />
    );
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toContain("<script>alert('xss')</script>");
  });
});

describe("Phase 6 - Mention compatibility inside rich formatting", () => {
  it("renders a mention inside bold text correctly", () => {
    render(<MentionText text="**Hey @Arjun Nair check this**" />);
    expect(screen.getByTestId("message-mention")).toBeInTheDocument();
    expect(screen.getByTestId("message-mention").textContent).toBe("@Arjun Nair");
  });

  it("renders a mention inside italic text correctly", () => {
    render(<MentionText text="*Hey @Sneha Rao check this*" />);
    expect(screen.getByTestId("message-mention")).toBeInTheDocument();
    expect(screen.getByTestId("message-mention").textContent).toBe("@Sneha Rao");
  });

  it("renders a mention inside a bullet list item correctly", () => {
    render(<MentionText text={"- Action item for @Priya Sharma"} />);
    expect(screen.getByTestId("message-mention")).toBeInTheDocument();
    expect(screen.getByTestId("message-bullet-list")).toBeInTheDocument();
  });
});

describe("Phase 6 - Safe and malformed link handling", () => {
  it("renders mailto: links as safe anchors", () => {
    const { container } = render(<MentionText text="Email [support](mailto:support@example.com)" />);
    const link = container.querySelector("a");
    expect(link).toBeInTheDocument();
    expect(link?.getAttribute("href")).toBe("mailto:support@example.com");
  });

  it("renders relative links as safe anchors", () => {
    const { container } = render(<MentionText text="Go [home](/app/dashboard)" />);
    const link = container.querySelector("a");
    expect(link).toBeInTheDocument();
    expect(link?.getAttribute("href")).toBe("/app/dashboard");
  });

  it("rejects data: URLs and renders as plain text", () => {
    const { container } = render(<MentionText text="[Image](data:image/png;base64,abc)" />);
    expect(container.querySelector("a")).not.toBeInTheDocument();
  });

  it("rejects vbscript: URLs and renders as plain text", () => {
    const { container } = render(<MentionText text="[Bad](vbscript:alert(1))" />);
    expect(container.querySelector("a")).not.toBeInTheDocument();
  });

  it("renders malformed link syntax as plain text when URL is missing", () => {
    const { container } = render(<MentionText text="Broken [link]()" />);
    expect(container.querySelector("a")).not.toBeInTheDocument();
  });
});

describe("Phase 6 - MessagingComposer Toolbar Clicks", () => {
  it("renders formatting toolbar with all standard testids", () => {
    render(<MessagingComposer placeholder="Type a message" />);
    expect(screen.getByTestId("composer-formatting-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("composer-fmt-bold")).toBeInTheDocument();
    expect(screen.getByTestId("composer-fmt-italic")).toBeInTheDocument();
    expect(screen.getByTestId("composer-fmt-strikethrough")).toBeInTheDocument();
    expect(screen.getByTestId("composer-fmt-link")).toBeInTheDocument();
    expect(screen.getByTestId("composer-fmt-list")).toBeInTheDocument();
    expect(screen.getByTestId("composer-fmt-code")).toBeInTheDocument();
  });

  it("appends markup to the composer input when clicking formatting buttons", () => {
    render(<MessagingComposer placeholder="Type a message" />);
    
    const input = screen.getByTestId("composer-input");
    expect(input.textContent).toBe("");

    fireEvent.click(screen.getByTestId("composer-fmt-bold"));
    expect(input.textContent).toContain("**bold text**");
  });
});

describe("Phase 6 - Thread reply composer formatting", () => {
  it("renders formatting toolbar in thread reply composer", () => {
    render(
      <MessagingThreadPanel
        anchorMessage={{
          id: "msg-1",
          body: "Anchor message",
          authorName: "Test",
          authorInitials: "T",
          authorRole: "member",
          sentAt: new Date().toISOString(),
          reactions: [],
          hasThread: true,
          threadReplyCount: 0,
          mentionsCurrentUser: false,
          status: "ACTIVE",
          editedAt: null,
          deletedAt: null,
        }}
        replies={[]}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId("thread-formatting-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("composer-fmt-bold")).toBeInTheDocument();
  });

  it("appends markup to thread reply input when clicking formatting buttons", () => {
    render(
      <MessagingThreadPanel
        anchorMessage={{
          id: "msg-1",
          body: "Anchor message",
          authorName: "Test",
          authorInitials: "T",
          authorRole: "member",
          sentAt: new Date().toISOString(),
          reactions: [],
          hasThread: true,
          threadReplyCount: 0,
          mentionsCurrentUser: false,
          status: "ACTIVE",
          editedAt: null,
          deletedAt: null,
        }}
        replies={[]}
        onClose={() => {}}
      />
    );
    const input = screen.getByTestId("thread-reply-input");
    expect(input.textContent).toBe("");
    fireEvent.click(screen.getByTestId("composer-fmt-bold"));
    expect(input.textContent).toContain("**bold text**");
  });
});

describe("Phase 6 - Thread reply rendering parity", () => {
  it("renders rich formatted text in thread reply rows", () => {
    render(
      <MessagingThreadPanel
        anchorMessage={{
          id: "msg-1",
          body: "Anchor",
          authorName: "A",
          authorInitials: "A",
          authorRole: "member",
          sentAt: new Date().toISOString(),
          reactions: [],
          hasThread: true,
          threadReplyCount: 1,
          mentionsCurrentUser: false,
          status: "ACTIVE",
          editedAt: null,
          deletedAt: null,
        }}
        replies={[
          {
            id: "reply-1",
            body: "Reply with **bold** text",
            authorName: "B",
            authorInitials: "B",
            authorRole: "member",
            sentAt: new Date().toISOString(),
            reactions: [],
            hasThread: false,
            threadReplyCount: 0,
            mentionsCurrentUser: false,
            status: "ACTIVE",
            editedAt: null,
            deletedAt: null,
          },
        ]}
        onClose={() => {}}
      />
    );
    const replyRow = screen.getByTestId("thread-reply-reply-1");
    const bold = replyRow.querySelector("strong");
    expect(bold).toBeInTheDocument();
    expect(bold?.textContent).toBe("bold");
  });
});
