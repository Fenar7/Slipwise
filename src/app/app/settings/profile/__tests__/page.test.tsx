import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockUseSupabaseSession = vi.fn();
const mockGetProfileSettings = vi.fn();
const mockSaveProfileSettings = vi.fn();

vi.mock("@/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => mockUseSupabaseSession(),
}));

vi.mock("../actions", () => ({
  getProfileSettings: (...args: unknown[]) => mockGetProfileSettings(...args),
  saveProfileSettings: (...args: unknown[]) => mockSaveProfileSettings(...args),
}));

import ProfileSettingsPage from "../page";

describe("ProfileSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSupabaseSession.mockReturnValue({ isPending: false });
    mockGetProfileSettings.mockResolvedValue({
      name: "Fenar Owner",
      email: "owner@example.com",
    });
  });

  it("loads persisted profile data", async () => {
    render(<ProfileSettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Fenar Owner")).toBeInTheDocument();
    });

    expect(screen.getAllByText("owner@example.com")).toHaveLength(2);
  });

  it("saves profile changes through server actions", async () => {
    mockSaveProfileSettings.mockResolvedValue({ success: true });
    render(<ProfileSettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Fenar Owner")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Updated Owner" },
    });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(mockSaveProfileSettings).toHaveBeenCalledWith({
        name: "Updated Owner",
      });
    });

    expect(screen.getByText("✓ Profile updated")).toBeInTheDocument();
  });
});
