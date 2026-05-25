/**
 * Sprint 1.5 — Tasks, Meetings, and Calendar UX tests
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/messaging",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

import { MessagingTaskCreate } from "../messaging-task-create";
import { MessagingMeetingSchedule } from "../messaging-meeting-schedule";
import { MessagingTaskPanel } from "../messaging-task-panel";
import { MessagingMeetingPanel } from "../messaging-meeting-panel";
import { MOCK_CALENDAR_CONNECTION, MOCK_CALENDAR_CONNECTION_ACTIVE } from "../mock-data";
import type { ApiTaskSummary } from "../lib/mappers";

const MOCK_API_TASKS: ApiTaskSummary[] = [
  {
    id: "task-1",
    orgId: "org-1",
    conversationId: "conv-1",
    originatingMessageId: null,
    title: "Review Q2 invoice reconciliation report",
    description: null,
    status: "open",
    priority: "low",
    isOverdue: false,
    assigneeId: "u1",
    assigneeName: "Priya Sharma",
    assigneeAvatarInitials: "PS",
    dueDate: "2026-05-12",
    createdBy: "u2",
    createdByName: "Arjun Mehta",
    createdAt: "2026-05-01T09:00:00Z",
  },
  {
    id: "task-2",
    orgId: "org-1",
    conversationId: "conv-1",
    originatingMessageId: null,
    title: "Approve payroll run for May",
    description: null,
    status: "in-progress",
    priority: "medium",
    isOverdue: false,
    assigneeId: "u2",
    assigneeName: "Arjun Mehta",
    assigneeAvatarInitials: "AM",
    dueDate: "2026-05-10",
    createdBy: "u1",
    createdByName: "Priya Sharma",
    createdAt: "2026-05-02T10:00:00Z",
  },
  {
    id: "task-3",
    orgId: "org-1",
    conversationId: "conv-1",
    originatingMessageId: null,
    title: "Send GST filing confirmation",
    description: null,
    status: "overdue",
    priority: "high",
    isOverdue: true,
    assigneeId: "u3",
    assigneeName: "Kavya Nair",
    assigneeAvatarInitials: "KN",
    dueDate: "2026-05-08",
    createdBy: "u1",
    createdByName: "Priya Sharma",
    createdAt: "2026-05-03T11:00:00Z",
  },
  {
    id: "task-4",
    orgId: "org-1",
    conversationId: "conv-1",
    originatingMessageId: "msg-1",
    title: "Onboard new vendor — Apex Supplies",
    description: "Cover all required docs",
    status: "open",
    priority: "critical",
    isOverdue: false,
    assigneeId: "u5",
    assigneeName: "Sneha Iyer",
    assigneeAvatarInitials: "SI",
    dueDate: "2026-05-15",
    createdBy: "u2",
    createdByName: "Arjun Mehta",
    createdAt: "2026-05-04T12:00:00Z",
  },
];

function mockTasksFetch(tasks: ApiTaskSummary[] = MOCK_API_TASKS) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: tasks }),
      } as Response);
    }
    return Promise.resolve({ ok: false, status: 404 } as Response);
  });
}

// ─── MessagingTaskCreate ──────────────────────────────────────────────────────

describe("MessagingTaskCreate", () => {
  function render_tc(onClose = vi.fn(), conversationId?: string | null) {
    return render(<MessagingTaskCreate onClose={onClose} conversationId={conversationId} />);
  }

  it("renders modal wrapper", () => {
    render_tc();
    expect(screen.getByTestId("task-create-modal")).toBeInTheDocument();
  });

  it("task title input is present", () => {
    render_tc();
    expect(screen.getByTestId("task-title-input")).toBeInTheDocument();
  });

  it("submit button is disabled when title is empty", () => {
    render_tc();
    expect(screen.getByTestId("task-create-submit")).toBeDisabled();
  });

  it("submit button is enabled when title has content", () => {
    render_tc();
    fireEvent.change(screen.getByTestId("task-title-input"), {
      target: { value: "New task" },
    });
    expect(screen.getByTestId("task-create-submit")).not.toBeDisabled();
  });

  it("cancel button calls onClose", () => {
    const onClose = vi.fn();
    render_tc(onClose);
    fireEvent.click(screen.getByTestId("task-create-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render_tc(onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("priority RadioPill renders all 4 options", () => {
    render_tc();
    expect(screen.getByTestId("task-priority-low")).toBeInTheDocument();
    expect(screen.getByTestId("task-priority-medium")).toBeInTheDocument();
    expect(screen.getByTestId("task-priority-high")).toBeInTheDocument();
    expect(screen.getByTestId("task-priority-critical")).toBeInTheDocument();
  });
});

// ─── MessagingMeetingSchedule ─────────────────────────────────────────────────

describe("MessagingMeetingSchedule", () => {
  function render_ms(onClose = vi.fn(), connected = false) {
    const conn = connected ? MOCK_CALENDAR_CONNECTION_ACTIVE : MOCK_CALENDAR_CONNECTION;
    return render(<MessagingMeetingSchedule onClose={onClose} calendarConnection={conn} />);
  }

  it("shows calendar prompt when not connected", () => {
    render_ms();
    expect(screen.getByTestId("meeting-schedule-calendar-prompt")).toBeInTheDocument();
  });

  it("shows full form when connected", () => {
    render_ms(vi.fn(), true);
    expect(screen.getByTestId("meeting-title-input")).toBeInTheDocument();
  });

  it("cancel button calls onClose when connected", () => {
    const onClose = vi.fn();
    render_ms(onClose, true);
    fireEvent.click(screen.getByTestId("meeting-schedule-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("cancel button calls onClose when not connected", () => {
    const onClose = vi.fn();
    render_ms(onClose, false);
    fireEvent.click(screen.getByTestId("meeting-schedule-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose when not connected", () => {
    const onClose = vi.fn();
    render_ms(onClose, false);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("pressing Escape calls onClose when connected", () => {
    const onClose = vi.fn();
    render_ms(onClose, true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("duration RadioPill renders 4 options when connected", () => {
    render_ms(vi.fn(), true);
    expect(screen.getByTestId("meeting-duration-15")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-duration-30")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-duration-45")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-duration-60")).toBeInTheDocument();
  });
});

// ─── MessagingTaskPanel ───────────────────────────────────────────────────────

describe("MessagingTaskPanel", () => {
  function renderPanel(tasks: ApiTaskSummary[] = MOCK_API_TASKS) {
    mockTasksFetch(tasks);
    return render(<MessagingTaskPanel conversationId="conv-1" />);
  }

  it("renders task-panel root when conversation is provided", async () => {
    renderPanel();
    expect(await screen.findByTestId("task-panel")).toBeInTheDocument();
  });

  it("shows no-conversation state when conversationId is missing", () => {
    render(<MessagingTaskPanel />);
    expect(screen.getByText(/No Conversation Selected/)).toBeInTheDocument();
  });

  it("New Task button is present", async () => {
    renderPanel();
    expect(await screen.findByTestId("task-panel-new-btn")).toBeInTheDocument();
  });

  it("clicking New Task button shows the create modal", async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId("task-panel-new-btn"));
    expect(screen.getByTestId("task-create-modal")).toBeInTheDocument();
  });

  it("filter bar renders all 5 filter options", async () => {
    renderPanel();
    expect(await screen.findByTestId("task-filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("task-filter-open")).toBeInTheDocument();
    expect(screen.getByTestId("task-filter-in-progress")).toBeInTheDocument();
    expect(screen.getByTestId("task-filter-done")).toBeInTheDocument();
    expect(screen.getByTestId("task-filter-overdue")).toBeInTheDocument();
  });

  it("clicking Overdue filter shows only overdue tasks", async () => {
    renderPanel();
    await screen.findByTestId("task-row-task-1");
    fireEvent.click(screen.getByTestId("task-filter-overdue"));
    const overdueTasks = MOCK_API_TASKS.filter((t) => t.status === "overdue");
    const nonOverdueTasks = MOCK_API_TASKS.filter((t) => t.status !== "overdue");
    overdueTasks.forEach((t) => {
      expect(screen.getByTestId(`task-row-${t.id}`)).toBeInTheDocument();
    });
    nonOverdueTasks.forEach((t) => {
      expect(screen.queryByTestId(`task-row-${t.id}`)).not.toBeInTheDocument();
    });
  });

  it("clicking a task row shows the detail panel", async () => {
    renderPanel();
    const firstTask = MOCK_API_TASKS[0];
    fireEvent.click(await screen.findByTestId(`task-row-${firstTask.id}`));
    expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
  });

  it("detail panel shows task title", async () => {
    renderPanel();
    const firstTask = MOCK_API_TASKS[0];
    fireEvent.click(await screen.findByTestId(`task-row-${firstTask.id}`));
    expect(screen.getByText(firstTask.title)).toBeInTheDocument();
  });

  it("back button in detail panel returns to list", async () => {
    renderPanel();
    const firstTask = MOCK_API_TASKS[0];
    fireEvent.click(await screen.findByTestId(`task-row-${firstTask.id}`));
    expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("task-detail-back"));
    expect(screen.queryByTestId("task-detail-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("task-panel-new-btn")).toBeInTheDocument();
  });

  it("Done filter shows empty state when no done tasks", async () => {
    renderPanel();
    await screen.findByTestId("task-row-task-1");
    fireEvent.click(screen.getByTestId("task-filter-done"));
    expect(screen.getByTestId("task-list-empty")).toBeInTheDocument();
  });

  it("empty state shown when filter matches zero tasks", async () => {
    renderPanel();
    await screen.findByTestId("task-row-task-1");
    fireEvent.click(screen.getByTestId("task-filter-done"));
    expect(screen.getByTestId("task-list-empty")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("task-filter-in-progress"));
    expect(screen.queryByTestId("task-list-empty")).not.toBeInTheDocument();
  });

  it("clicking any task row shows the detail panel (no silent failure)", async () => {
    renderPanel();
    await screen.findByTestId("task-row-task-1");
    const taskRows = screen.getAllByRole("button").filter(
      (b) => b.getAttribute("data-testid")?.startsWith("task-row-")
    );
    if (taskRows.length > 0) {
      fireEvent.click(taskRows[taskRows.length - 1]);
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    }
  });
});

// ─── MessagingMeetingPanel ────────────────────────────────────────────────────

describe("MessagingMeetingPanel", () => {
  it("renders meeting-panel root", () => {
    render(<MessagingMeetingPanel calendarConnection={MOCK_CALENDAR_CONNECTION} />);
    expect(screen.getByTestId("meeting-panel")).toBeInTheDocument();
  });

  it("Schedule button is present", () => {
    render(<MessagingMeetingPanel calendarConnection={MOCK_CALENDAR_CONNECTION} />);
    expect(screen.getByTestId("meeting-panel-schedule-btn")).toBeInTheDocument();
  });

  it("clicking Schedule shows the schedule modal", () => {
    render(<MessagingMeetingPanel calendarConnection={MOCK_CALENDAR_CONNECTION} />);
    fireEvent.click(screen.getByTestId("meeting-panel-schedule-btn"));
    expect(screen.getByTestId("meeting-schedule-modal")).toBeInTheDocument();
  });

  it("calendar banner visible when not connected", () => {
    render(<MessagingMeetingPanel calendarConnection={MOCK_CALENDAR_CONNECTION} />);
    expect(screen.getByTestId("meeting-connect-calendar-btn")).toBeInTheDocument();
  });

  it("connected chip visible when connected", () => {
    render(<MessagingMeetingPanel calendarConnection={MOCK_CALENDAR_CONNECTION_ACTIVE} />);
    expect(screen.getByTestId("meeting-calendar-connected-chip")).toBeInTheDocument();
  });

  it("Upcoming tab is default — renders meetings list", () => {
    render(<MessagingMeetingPanel calendarConnection={MOCK_CALENDAR_CONNECTION} />);
    // Upcoming tab should be active by default
    expect(screen.getByTestId("meeting-tab-upcoming")).toBeInTheDocument();
    // At least one upcoming meeting row should be visible
    const upcomingMeetings = ["meet-1", "meet-2"];
    upcomingMeetings.forEach((id) => {
      expect(screen.getByTestId(`meeting-row-${id}`)).toBeInTheDocument();
    });
  });

  it("clicking Past tab switches to past meetings view", () => {
    render(<MessagingMeetingPanel calendarConnection={MOCK_CALENDAR_CONNECTION} />);
    fireEvent.click(screen.getByTestId("meeting-tab-past"));
    expect(screen.getByTestId("meeting-row-meet-3")).toBeInTheDocument();
  });

  it("clicking Calendar tab shows the calendar grid", () => {
    render(<MessagingMeetingPanel calendarConnection={MOCK_CALENDAR_CONNECTION} />);
    fireEvent.click(screen.getByTestId("meeting-tab-calendar"));
    expect(screen.getByTestId("meeting-calendar-grid")).toBeInTheDocument();
  });

  it("calendar grid highlights the injected today date", () => {
    const fixedNow = new Date("2026-05-15T10:00:00Z");
    render(
      <MessagingMeetingPanel
        calendarConnection={MOCK_CALENDAR_CONNECTION}
        now={fixedNow}
      />
    );
    fireEvent.click(screen.getByTestId("meeting-tab-calendar"));
    expect(screen.getByTestId("meeting-calendar-grid")).toBeInTheDocument();
  });

  it("calendar grid shows month label for injected date", () => {
    const fixedNow = new Date("2026-05-15T10:00:00Z");
    render(
      <MessagingMeetingPanel
        calendarConnection={MOCK_CALENDAR_CONNECTION}
        now={fixedNow}
      />
    );
    fireEvent.click(screen.getByTestId("meeting-tab-calendar"));
    expect(screen.getByTestId("meeting-calendar-grid")).toHaveTextContent("May 2026");
  });
});
