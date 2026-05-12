import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock hooks
const mockUseActiveOrg = vi.fn();

vi.mock("@/hooks/use-active-org", () => ({
  useActiveOrg: () => mockUseActiveOrg(),
}));

// Mock server actions
const mockGetSequenceSettings = vi.fn();
const mockInitializeSequenceSettings = vi.fn();
const mockUpdateSequenceSettings = vi.fn();
const mockSeedSequenceSetting = vi.fn();
const mockGetSequenceHistory = vi.fn();
const mockGetSupportOverview = vi.fn();
const mockRunSequenceHealthCheck = vi.fn();
const mockDiagnoseSequenceHealth = vi.fn();

vi.mock("../actions", () => ({
  getSequenceSettings: (...args: unknown[]) => mockGetSequenceSettings(...args),
  initializeSequenceSettings: (...args: unknown[]) => mockInitializeSequenceSettings(...args),
  updateSequenceSettings: (...args: unknown[]) => mockUpdateSequenceSettings(...args),
  seedSequenceSetting: (...args: unknown[]) => mockSeedSequenceSetting(...args),
  getSequenceHistory: (...args: unknown[]) => mockGetSequenceHistory(...args),
  getSupportOverview: (...args: unknown[]) => mockGetSupportOverview(...args),
  runSequenceHealthCheck: (...args: unknown[]) => mockRunSequenceHealthCheck(...args),
  diagnoseSequenceHealth: (...args: unknown[]) => mockDiagnoseSequenceHealth(...args),
}));

import SequenceSettingsPage from "../page";

describe("SequenceSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActiveOrg.mockReturnValue({
      activeOrg: { id: "org-1", role: "owner" },
      isLoading: false,
    });
    mockGetSequenceSettings.mockResolvedValue({
      invoice: {
        documentType: "INVOICE",
        name: "Invoice Sequence",
        periodicity: "YEARLY",
        isActive: true,
        formatString: "INV/{YYYY}/{NNNNN}",
        startCounter: 1,
        counterPadding: 5,
        currentCounter: 42,
        nextPreview: "INV/2026/00043",
      },
      voucher: {
        documentType: "VOUCHER",
        name: "Voucher Sequence",
        periodicity: "YEARLY",
        isActive: true,
        formatString: "VCH/{YYYY}/{NNNNN}",
        startCounter: 1,
        counterPadding: 5,
        currentCounter: 10,
        nextPreview: "VCH/2026/00011",
      },
      canEdit: true,
    });
  });

  it("renders everyday setup with invoice and voucher summaries", async () => {
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Invoice Numbering").length).toBeGreaterThanOrEqual(1);
    });

    // Section titles
    const invoiceTitles = screen.getAllByText("Invoice Numbering");
    expect(invoiceTitles.length).toBeGreaterThanOrEqual(1);
    const voucherTitles = screen.getAllByText("Voucher Numbering");
    expect(voucherTitles.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText("INV/2026/00043")).toBeInTheDocument();
    expect(screen.getByText("VCH/2026/00011")).toBeInTheDocument();
  });

  it("shows latest issued and next number for each sequence", async () => {
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    expect(screen.getByText("INV/2026/00043")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("VCH/2026/00011")).toBeInTheDocument();
  });

  it("allows owner to enter edit mode for invoice numbering", async () => {
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Edit numbering").length).toBeGreaterThan(0);
    });

    const editButtons = screen.getAllByText("Edit numbering");
    fireEvent.click(editButtons[0]);

    expect(screen.getByText("Number pattern builder")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. INV")).toBeInTheDocument();
  });

  it("shows advanced format editor toggle", async () => {
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Edit numbering").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText("Edit numbering")[0]);
    fireEvent.click(screen.getByText("Advanced format editor"));

    expect(screen.getByPlaceholderText("INV/{YYYY}/{NNNNN}")).toBeInTheDocument();
  });

  it("saves updated builder config", async () => {
    mockUpdateSequenceSettings.mockResolvedValue({ success: true });
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Edit numbering").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText("Edit numbering")[0]);

    const prefixInput = screen.getByPlaceholderText("e.g. INV");
    fireEvent.change(prefixInput, { target: { value: "REC" } });

    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(mockUpdateSequenceSettings).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({
          documentType: "INVOICE",
          formatString: "REC/{YYYY}/{NNNNN}",
          periodicity: "YEARLY",
        })
      );
    });
  });

  it("shows continuity section for owner", async () => {
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Continue from existing numbers")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("e.g. INV/2026/00042")).toBeInTheDocument();
  });

  it("saves advanced-mode format with derived periodicity", async () => {
    mockUpdateSequenceSettings.mockResolvedValue({ success: true });
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Edit numbering").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText("Edit numbering")[0]);
    fireEvent.click(screen.getByText("Advanced format editor"));

    const formatInput = screen.getByPlaceholderText("INV/{YYYY}/{NNNNN}");
    fireEvent.change(formatInput, { target: { value: "REC/{YYYY}/{MM}/{NNNNN}" } });

    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(mockUpdateSequenceSettings).toHaveBeenCalledWith(
        "org-1",
        expect.objectContaining({
          documentType: "INVOICE",
          formatString: "REC/{YYYY}/{MM}/{NNNNN}",
          periodicity: "MONTHLY",
        })
      );
    });
  });

  it("shows next number preview in continuity section", async () => {
    mockSeedSequenceSetting.mockResolvedValue({ nextPreview: "INV/2026/00043" });
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. INV/2026/00042")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("e.g. INV/2026/00042");
    fireEvent.change(input, { target: { value: "INV/2026/00042" } });

    await waitFor(() => {
      expect(screen.getByText(/Slipwise will next issue:/)).toBeInTheDocument();
    });

    // The preview appears inside the continuity section's blue box
    const continuityPreview = screen.getByText("INV/2026/00043", {
      selector: "span.font-mono.font-medium",
    });
    expect(continuityPreview).toBeInTheDocument();
  });

  it("shows error for mismatched continuity number", async () => {
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. INV/2026/00042")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("e.g. INV/2026/00042");
    fireEvent.change(input, { target: { value: "WRONG/123" } });

    await waitFor(() => {
      expect(
        screen.getByText(/This number does not match your current numbering style/)
      ).toBeInTheDocument();
    });
  });

  it("does not show edit buttons for non-owner", async () => {
    mockUseActiveOrg.mockReturnValue({
      activeOrg: { id: "org-1", role: "member" },
      isLoading: false,
    });
    mockGetSequenceSettings.mockResolvedValue({
      invoice: {
        documentType: "INVOICE",
        name: "Invoice Sequence",
        periodicity: "YEARLY",
        isActive: true,
        formatString: "INV/{YYYY}/{NNNNN}",
        startCounter: 1,
        counterPadding: 5,
        currentCounter: 42,
        nextPreview: "INV/2026/00043",
      },
      voucher: {
        documentType: "VOUCHER",
        name: "Voucher Sequence",
        periodicity: "YEARLY",
        isActive: true,
        formatString: "VCH/{YYYY}/{NNNNN}",
        startCounter: 1,
        counterPadding: 5,
        currentCounter: 10,
        nextPreview: "VCH/2026/00011",
      },
      canEdit: false,
    });
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Invoice Numbering").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("Edit numbering")).not.toBeInTheDocument();
    expect(screen.queryByText("Continue from existing numbers")).not.toBeInTheDocument();
  });

  it("shows owner setup actions when a sequence is missing", async () => {
    mockGetSequenceSettings.mockResolvedValue({
      invoice: null,
      voucher: {
        documentType: "VOUCHER",
        name: "Voucher Sequence",
        periodicity: "YEARLY",
        isActive: true,
        formatString: "VCH/{YYYY}/{NNNNN}",
        startCounter: 1,
        counterPadding: 5,
        currentCounter: 10,
        nextPreview: "VCH/2026/00011",
      },
      canEdit: true,
    });

    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Set up invoice numbering")).toBeInTheDocument();
    });

    expect(screen.getByText("Customize")).toBeInTheDocument();
    expect(screen.getByText("Recommended default")).toBeInTheDocument();
    expect(screen.getByText("INV/2026/00001")).toBeInTheDocument();
    expect(screen.queryByText(/Run the migration script/i)).not.toBeInTheDocument();
  });

  it("initializes a missing sequence from recommended defaults", async () => {
    mockGetSequenceSettings
      .mockResolvedValueOnce({
        invoice: null,
        voucher: {
          documentType: "VOUCHER",
          name: "Voucher Sequence",
          periodicity: "YEARLY",
          isActive: true,
          formatString: "VCH/{YYYY}/{NNNNN}",
          startCounter: 1,
          counterPadding: 5,
          currentCounter: 10,
          nextPreview: "VCH/2026/00011",
        },
        canEdit: true,
      })
      .mockResolvedValueOnce({
        invoice: {
          documentType: "INVOICE",
          name: "Invoice Sequence",
          periodicity: "YEARLY",
          isActive: true,
          formatString: "INV/{YYYY}/{NNNNN}",
          startCounter: 1,
          counterPadding: 5,
          currentCounter: 0,
          nextPreview: "INV/2026/00001",
        },
        voucher: {
          documentType: "VOUCHER",
          name: "Voucher Sequence",
          periodicity: "YEARLY",
          isActive: true,
          formatString: "VCH/{YYYY}/{NNNNN}",
          startCounter: 1,
          counterPadding: 5,
          currentCounter: 10,
          nextPreview: "VCH/2026/00011",
        },
        canEdit: true,
      });
    mockInitializeSequenceSettings.mockResolvedValue({ success: true, created: ["INVOICE"] });

    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Set up invoice numbering")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Set up invoice numbering"));

    await waitFor(() => {
      expect(mockInitializeSequenceSettings).toHaveBeenCalledWith("org-1", {
        documentType: "INVOICE",
        formatString: undefined,
        periodicity: undefined,
        latestUsedNumber: undefined,
      });
    });
  });

  it("toggles history and troubleshooting section", async () => {
    render(<SequenceSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/History and troubleshooting/)).toBeInTheDocument();
    });

    // Should be collapsed initially
    expect(screen.queryByText("Sequence history")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/History and troubleshooting/));

    await waitFor(() => {
      expect(screen.getByText("Sequence history")).toBeInTheDocument();
    });
  });
});
