import { describe, it, expect } from "vitest";
import {
  computeOverallCoverage,
  folderIsGenuinelyEmpty,
  folderMayHaveMoreData,
  GMAIL_REQUIRED_COVERAGE_FOLDERS,
} from "../domain-types";
import type {
  MailboxFolderCoverageSummary,
  MailboxOverallCoverage,
  MailboxCoverageFolder,
} from "../domain-types";

function makeCoverage(
  folder: string,
  state: string,
  totalThreads = 0,
): MailboxFolderCoverageSummary {
  return {
    folder,
    state: state as MailboxFolderCoverageSummary["state"],
    totalThreads,
    lastCompletedAt: null,
    errorSummary: null,
  };
}

function makeComplete(folder: string, totalThreads = 10): MailboxFolderCoverageSummary {
  return { ...makeCoverage(folder, "COMPLETE", totalThreads), lastCompletedAt: new Date().toISOString() };
}

describe("computeOverallCoverage", () => {
  it("returns PENDING for empty coverage list", () => {
    expect(computeOverallCoverage([])).toBe("PENDING");
  });

  it("returns PENDING when all required folders are PENDING", () => {
    const coverages = GMAIL_REQUIRED_COVERAGE_FOLDERS.map((f) =>
      makeCoverage(f, "PENDING"),
    );
    expect(computeOverallCoverage(coverages)).toBe("PENDING");
  });

  it("returns COMPLETE when all required folders are COMPLETE", () => {
    const coverages = GMAIL_REQUIRED_COVERAGE_FOLDERS.map((f) =>
      makeComplete(f),
    );
    expect(computeOverallCoverage(coverages)).toBe("COMPLETE");
  });

  it("returns BOOTSTRAPPING when any required folder is BOOTSTRAPPING", () => {
    const coverages = [
      makeComplete("INBOX"),
      makeComplete("SENT"),
      makeCoverage("SPAM", "BOOTSTRAPPING"),
      makeComplete("DRAFT"),
      makeComplete("ARCHIVE"),
    ];
    expect(computeOverallCoverage(coverages)).toBe("BOOTSTRAPPING");
  });

  it("returns ERRORED when any required folder is ERRORED", () => {
    const coverages = [
      makeComplete("INBOX"),
      makeComplete("SENT"),
      makeCoverage("SPAM", "ERRORED"),
      makeCoverage("DRAFT", "BOOTSTRAPPING"),
    ];
    expect(computeOverallCoverage(coverages)).toBe("ERRORED");
  });

  it("returns RECOVERING when any required folder is RECOVERING", () => {
    const coverages = [
      makeComplete("INBOX"),
      makeComplete("SENT"),
      makeCoverage("SPAM", "RECOVERING"),
      makeComplete("DRAFT"),
    ];
    expect(computeOverallCoverage(coverages)).toBe("RECOVERING");
  });

  it("returns PARTIAL when some folders are COMPLETE and others are PENDING", () => {
    const coverages = [
      makeComplete("INBOX"),
      makeCoverage("SENT", "PENDING"),
      makeCoverage("SPAM", "PENDING"),
      makeComplete("DRAFT"),
    ];
    expect(computeOverallCoverage(coverages)).toBe("PARTIAL");
  });

  it("ignores non-required ARCHIVE folder for overall computation", () => {
    const coverages = [
      makeComplete("INBOX"),
      makeComplete("SENT"),
      makeComplete("SPAM"),
      makeComplete("DRAFT"),
      makeCoverage("ARCHIVE", "BOOTSTRAPPING"),
    ];
    expect(computeOverallCoverage(coverages)).toBe("COMPLETE");
  });

  it("returns PARTIAL when only non-required folders exist", () => {
    const coverages = [makeCoverage("ARCHIVE", "COMPLETE")];
    expect(computeOverallCoverage(coverages)).toBe("PENDING");
  });
});

describe("folderIsGenuinelyEmpty", () => {
  it("returns true when COMPLETE with 0 threads", () => {
    expect(
      folderIsGenuinelyEmpty(makeCoverage("INBOX", "COMPLETE", 0)),
    ).toBe(true);
  });

  it("returns false when COMPLETE with threads", () => {
    expect(
      folderIsGenuinelyEmpty(makeCoverage("INBOX", "COMPLETE", 5)),
    ).toBe(false);
  });

  it("returns false when not COMPLETE", () => {
    expect(
      folderIsGenuinelyEmpty(makeCoverage("INBOX", "BOOTSTRAPPING", 0)),
    ).toBe(false);
  });

  it("returns false for null coverage", () => {
    expect(folderIsGenuinelyEmpty(null)).toBe(false);
  });
});

describe("folderMayHaveMoreData", () => {
  it("returns false when COMPLETE", () => {
    expect(
      folderMayHaveMoreData(makeCoverage("SENT", "COMPLETE")),
    ).toBe(false);
  });

  it("returns true when BOOTSTRAPPING", () => {
    expect(
      folderMayHaveMoreData(makeCoverage("SENT", "BOOTSTRAPPING")),
    ).toBe(true);
  });

  it("returns true when PENDING", () => {
    expect(
      folderMayHaveMoreData(makeCoverage("SENT", "PENDING")),
    ).toBe(true);
  });

  it("returns true for null coverage", () => {
    expect(folderMayHaveMoreData(null)).toBe(true);
  });
});

describe("GMAIL_REQUIRED_COVERAGE_FOLDERS", () => {
  it("includes INBOX, SENT, SPAM, DRAFT", () => {
    expect(GMAIL_REQUIRED_COVERAGE_FOLDERS).toEqual([
      "INBOX",
      "SENT",
      "SPAM",
      "DRAFT",
    ]);
  });

  it("does NOT include ARCHIVE or ALL_MAIL", () => {
    expect(GMAIL_REQUIRED_COVERAGE_FOLDERS).not.toContain("ARCHIVE");
    expect(GMAIL_REQUIRED_COVERAGE_FOLDERS).not.toContain("ALL_MAIL");
  });
});

describe("coverage state lifecycle", () => {
  it("PENDING → BOOTSTRAPPING → COMPLETE → RECOVERING → COMPLETE", () => {
    const coverages: MailboxFolderCoverageSummary[] = [
      makeCoverage("INBOX", "PENDING"),
      makeCoverage("SENT", "PENDING"),
      makeCoverage("SPAM", "PENDING"),
      makeCoverage("DRAFT", "PENDING"),
    ];
    expect(computeOverallCoverage(coverages)).toBe("PENDING");

    // Bootstrap starts
    coverages[0] = makeCoverage("INBOX", "BOOTSTRAPPING");
    expect(computeOverallCoverage(coverages)).toBe("BOOTSTRAPPING");

    // All complete
    coverages[0] = makeComplete("INBOX");
    coverages[1] = makeComplete("SENT");
    coverages[2] = makeComplete("SPAM");
    coverages[3] = makeComplete("DRAFT");
    expect(computeOverallCoverage(coverages)).toBe("COMPLETE");

    // SPAM needs recovery
    coverages[2] = makeCoverage("SPAM", "RECOVERING");
    expect(computeOverallCoverage(coverages)).toBe("RECOVERING");

    // Recovery done
    coverages[2] = makeComplete("SPAM");
    expect(computeOverallCoverage(coverages)).toBe("COMPLETE");
  });
});

describe("truthful bootstrap completion", () => {
  it("overallState remains BOOTSTRAPPING when any required folder is BOOTSTRAPPING", () => {
    // Simulate INBOX and SENT exhausted (COMPLETE), but SPAM hit page cap (BOOTSTRAPPING)
    const coverages = [
      makeComplete("INBOX", 100),
      makeComplete("SENT", 45),
      makeCoverage("SPAM", "BOOTSTRAPPING", 1000),
      makeCoverage("DRAFT", "COMPLETE", 5),
    ];
    expect(computeOverallCoverage(coverages)).toBe("BOOTSTRAPPING");
  });

  it("totalThreads is non-zero for non-empty COMPLETE folders", () => {
    expect(folderIsGenuinelyEmpty(makeCoverage("INBOX", "COMPLETE", 100))).toBe(false);
    expect(folderIsGenuinelyEmpty(makeCoverage("SENT", "COMPLETE", 1))).toBe(false);
  });

  it("totalThreads is zero for genuinely empty COMPLETE folders", () => {
    expect(folderIsGenuinelyEmpty(makeCoverage("SPAM", "COMPLETE", 0))).toBe(true);
  });

  it("BOOTSTRAPPING folder with threads is never genuinely empty", () => {
    // Even if totalThreads is 0 during bootstrap, we don't know yet
    expect(folderIsGenuinelyEmpty(makeCoverage("INBOX", "BOOTSTRAPPING", 0))).toBe(false);
    expect(folderIsGenuinelyEmpty(makeCoverage("INBOX", "BOOTSTRAPPING", 500))).toBe(false);
  });

  it("overallState is PARTIAL when some exhausted and others PENDING", () => {
    const coverages = [
      makeComplete("INBOX", 200),
      makeCoverage("SENT", "PENDING", 0),
      makeCoverage("SPAM", "PENDING", 0),
      makeComplete("DRAFT", 0),
    ];
    expect(computeOverallCoverage(coverages)).toBe("PARTIAL");
  });

  it("overallState is only COMPLETE when ALL required folders are COMPLETE", () => {
    const coverages = [
      makeComplete("INBOX", 200),
      makeComplete("SENT", 50),
      makeComplete("SPAM", 0),
      makeComplete("DRAFT", 12),
    ];
    expect(computeOverallCoverage(coverages)).toBe("COMPLETE");
  });
});

describe("bootstrap slice exhaustion vs bounded cap", () => {
  it("bootstrapSliceResults with paginationExhausted=false means folder is not yet COMPLETE", () => {
    // The sync service should call updateFolderCoverageBootstrapping, not markComplete
    const coverages = [
      makeComplete("INBOX", 100),
      makeCoverage("SENT", "BOOTSTRAPPING", 350),
      makeCoverage("SPAM", "BOOTSTRAPPING", 1000),
      makeComplete("DRAFT", 5),
    ];
    // SENT and SPAM not exhausted → overall should be BOOTSTRAPPING
    expect(computeOverallCoverage(coverages)).toBe("BOOTSTRAPPING");
  });

  it("bootstrapSliceResults with paginationExhausted=true means folder IS COMPLETE", () => {
    const coverages = [
      makeComplete("INBOX", 100),
      makeComplete("SENT", 50),
      makeComplete("SPAM", 25),
      makeComplete("DRAFT", 3),
    ];
    expect(computeOverallCoverage(coverages)).toBe("COMPLETE");
  });
});

describe("no false empties after partial coverage", () => {
  it("SENT with BOOTSTRAPPING and non-zero threads: not empty, may have more data", () => {
    const cov = makeCoverage("SENT", "BOOTSTRAPPING", 350);
    expect(folderIsGenuinelyEmpty(cov)).toBe(false);
    expect(folderMayHaveMoreData(cov)).toBe(true);
  });

  it("DRAFT with COMPLETE and 0 threads: genuinely empty, no more data", () => {
    const cov = makeCoverage("DRAFT", "COMPLETE", 0);
    expect(folderIsGenuinelyEmpty(cov)).toBe(true);
    expect(folderMayHaveMoreData(cov)).toBe(false);
  });

  it("SPAM with COMPLETE and 25 threads: not empty, no more data expected", () => {
    const cov = makeCoverage("SPAM", "COMPLETE", 25);
    expect(folderIsGenuinelyEmpty(cov)).toBe(false);
    expect(folderMayHaveMoreData(cov)).toBe(false);
  });

  it("null coverage: not genuinely empty, may have more data", () => {
    expect(folderIsGenuinelyEmpty(null)).toBe(false);
    expect(folderMayHaveMoreData(null)).toBe(true);
  });
});
