import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TagPicker } from "../tag-picker";

const mockTags = [
  { id: "tag_1", orgId: "org_1", name: "Hotel Sarovar", slug: "hotel-sarovar", color: "#3b82f6", description: null, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
  { id: "tag_2", orgId: "org_1", name: "Mumbai Branch", slug: "mumbai-branch", color: "#10b981", description: null, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
  { id: "tag_3", orgId: "org_1", name: "Wedding Season", slug: "wedding-season", color: "#f59e0b", description: null, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
  { id: "tag_4", orgId: "org_1", name: "Old Event", slug: "old-event", color: "#6b7280", description: null, isArchived: true, createdAt: new Date(), updatedAt: new Date() },
];

vi.mock("@/lib/tags/tag-service", () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  canManageTags: vi.fn(),
}));

import { listTags, createTag, canManageTags } from "@/lib/tags/tag-service";

beforeEach(() => {
  vi.clearAllMocks();
  // Now we fetch with includeArchived: true, so include archived tags in mock
  vi.mocked(listTags).mockResolvedValue({
    success: true,
    data: mockTags,
  });
  vi.mocked(canManageTags).mockResolvedValue(true);
});

describe("TagPicker", () => {
  it("renders with placeholder when no tags selected", () => {
    render(<TagPicker value={[]} onChange={() => {}} />);
    expect(screen.getByPlaceholderText("Add tag...")).toBeInTheDocument();
  });

  it("displays selected tags as chips", async () => {
    render(<TagPicker value={["tag_1", "tag_2"]} onChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Hotel Sarovar")).toBeInTheDocument();
      expect(screen.getByText("Mumbai Branch")).toBeInTheDocument();
    });
  });

  it("opens dropdown on click", async () => {
    render(<TagPicker value={[]} onChange={() => {}} />);
    fireEvent.focus(screen.getByPlaceholderText("Add tag..."));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search tags...")).toBeInTheDocument();
    });
  });

  it("selects a tag from dropdown", async () => {
    const onChange = vi.fn();
    render(<TagPicker value={[]} onChange={onChange} />);

    fireEvent.focus(screen.getByPlaceholderText("Add tag..."));

    await waitFor(() => {
      expect(screen.getByText("Hotel Sarovar")).toBeInTheDocument();
    });

    const dropdownItem = screen.getByRole("button", { name: "Hotel Sarovar" });
    fireEvent.click(dropdownItem);

    expect(onChange).toHaveBeenCalledWith(["tag_1"]);
  });

  it("removes a tag via chip remove button", async () => {
    const onChange = vi.fn();
    render(<TagPicker value={["tag_1", "tag_2"]} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByText("Hotel Sarovar")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    fireEvent.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith(["tag_2"]);
  });

  it("filters tags by search", async () => {
    render(<TagPicker value={[]} onChange={() => {}} />);
    fireEvent.focus(screen.getByPlaceholderText("Add tag..."));

    await waitFor(() => {
      expect(screen.getByText("Hotel Sarovar")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search tags...");
    fireEvent.change(searchInput, { target: { value: "Mumbai" } });

    await waitFor(() => {
      expect(screen.getByText("Mumbai Branch")).toBeInTheDocument();
      expect(screen.queryByText("Hotel Sarovar")).not.toBeInTheDocument();
      expect(screen.queryByText("Wedding Season")).not.toBeInTheDocument();
    });
  });

  it("shows create button when no tags match search and user can manage", async () => {
    render(<TagPicker value={[]} onChange={() => {}} />);
    fireEvent.focus(screen.getByPlaceholderText("Add tag..."));

    await waitFor(() => {
      expect(screen.getByText("Hotel Sarovar")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Search tags..."), {
      target: { value: "New Unique Tag" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Create/ })).toBeInTheDocument();
    });
  });

  it("creates a new tag via inline create", async () => {
    const onChange = vi.fn();
    vi.mocked(createTag).mockResolvedValue({
      success: true,
      data: { id: "tag_new", orgId: "org_1", name: "New Unique Tag", slug: "new-unique-tag", color: null, description: null, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
    });

    render(<TagPicker value={[]} onChange={onChange} />);
    fireEvent.focus(screen.getByPlaceholderText("Add tag..."));

    await waitFor(() => {
      expect(screen.getByText("Hotel Sarovar")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Search tags..."), {
      target: { value: "New Unique Tag" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Create/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Create/ }));

    await waitFor(() => {
      expect(createTag).toHaveBeenCalledWith({ name: "New Unique Tag" });
      expect(onChange).toHaveBeenCalledWith(["tag_new"]);
    });
  });

  it("shows error when inline create fails", async () => {
    vi.mocked(createTag).mockResolvedValue({
      success: false,
      error: "A tag with a similar name already exists",
    });

    render(<TagPicker value={[]} onChange={() => {}} />);
    fireEvent.focus(screen.getByPlaceholderText("Add tag..."));

    await waitFor(() => {
      expect(screen.getByText("Hotel Sarovar")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Search tags..."), {
      target: { value: "Hotel Sarovar" },
    });

    // "Hotel Sarovar" already exists (exactMatchExists = true), so no create button
    // Try a truly unique name
    fireEvent.change(screen.getByPlaceholderText("Search tags..."), {
      target: { value: "Duplicate Name" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Create/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Create/ }));

    await waitFor(() => {
      expect(screen.getByText("A tag with a similar name already exists")).toBeInTheDocument();
    });
  });

  it("does not show create when user lacks permission", async () => {
    vi.mocked(canManageTags).mockResolvedValue(false);

    render(<TagPicker value={[]} onChange={() => {}} />);
    fireEvent.focus(screen.getByPlaceholderText("Add tag..."));

    await waitFor(() => {
      expect(screen.getByText("Hotel Sarovar")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Search tags..."), {
      target: { value: "New Unique Tag" },
    });

    await waitFor(() => {
      expect(screen.getByText(/Contact an admin/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Create/ })).not.toBeInTheDocument();
  });

  it("closes dropdown on Escape", async () => {
    render(<TagPicker value={[]} onChange={() => {}} />);
    fireEvent.focus(screen.getByPlaceholderText("Add tag..."));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search tags...")).toBeInTheDocument();
    });

    fireEvent.keyDown(screen.getByPlaceholderText("Search tags..."), { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search tags...")).not.toBeInTheDocument();
    });
  });

  it("does not show archived tags in dropdown unless already assigned", async () => {
    render(<TagPicker value={[]} onChange={() => {}} />);
    fireEvent.focus(screen.getByPlaceholderText("Add tag..."));

    await waitFor(() => {
      expect(screen.getByText("Hotel Sarovar")).toBeInTheDocument();
    });

    expect(screen.queryByText("Old Event")).not.toBeInTheDocument();
  });

  it("shows archived assigned tag as chip", async () => {
    render(
      <TagPicker
        value={["tag_4"]}
        onChange={() => {}}
        archivedTagIds={["tag_4"]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Old Event")).toBeInTheDocument();
    });
  });
});
