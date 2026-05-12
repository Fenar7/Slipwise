/**
 * Mailbox Phase 3 Sprint 3.3 — Gmail provider parsing and direction
 * classification regression tests.
 */

import { describe, it, expect } from "vitest";

import {
  parseAddressListHeader,
  parseAddressHeader,
  isOutbound,
} from "@/lib/mailbox/gmail-provider";

describe("Sprint 3.3 — Gmail address-list parsing robustness", () => {
  describe("parseAddressHeader", () => {
    it("parses angle-bracket form with display name", () => {
      const result = parseAddressHeader("John Doe <john@example.com>");
      expect(result).toEqual({ email: "john@example.com", displayName: "John Doe" });
    });

    it("parses quoted display name with angle brackets", () => {
      const result = parseAddressHeader('"Smith, John" <john@example.com>');
      expect(result).toEqual({ email: "john@example.com", displayName: "Smith, John" });
    });

    it("parses bare email address", () => {
      const result = parseAddressHeader("john@example.com");
      expect(result).toEqual({ email: "john@example.com", displayName: null });
    });

    it("returns null for empty string", () => {
      expect(parseAddressHeader("")).toBeNull();
    });

    it("returns null for malformed fragment without @", () => {
      expect(parseAddressHeader("not-an-email")).toBeNull();
    });

    it("strips surrounding quotes from display name", () => {
      const result = parseAddressHeader('"Jane Doe" <jane@example.com>');
      expect(result).toEqual({ email: "jane@example.com", displayName: "Jane Doe" });
    });
  });

  describe("parseAddressListHeader", () => {
    it("handles single bare address", () => {
      const result = parseAddressListHeader("john@example.com");
      expect(result).toEqual([{ email: "john@example.com", displayName: null }]);
    });

    it("handles multiple bare addresses separated by commas", () => {
      const result = parseAddressListHeader("john@example.com, jane@example.com");
      expect(result).toEqual([
        { email: "john@example.com", displayName: null },
        { email: "jane@example.com", displayName: null },
      ]);
    });

    it("handles quoted display name containing commas", () => {
      const result = parseAddressListHeader('"Smith, John" <john@example.com>');
      expect(result).toEqual([{ email: "john@example.com", displayName: "Smith, John" }]);
    });

    it("handles mixed quoted and unquoted addresses with commas", () => {
      const result = parseAddressListHeader(
        '"Smith, John" <john@example.com>, jane@example.com, "Doe, Alice" <alice@example.com>',
      );
      expect(result).toEqual([
        { email: "john@example.com", displayName: "Smith, John" },
        { email: "jane@example.com", displayName: null },
        { email: "alice@example.com", displayName: "Doe, Alice" },
      ]);
    });

    it("handles angle-bracket addresses without quotes", () => {
      const result = parseAddressListHeader("John Doe <john@example.com>, Jane Doe <jane@example.com>");
      expect(result).toEqual([
        { email: "john@example.com", displayName: "John Doe" },
        { email: "jane@example.com", displayName: "Jane Doe" },
      ]);
    });

    it("ignores malformed fragments without corrupting valid addresses", () => {
      const result = parseAddressListHeader("john@example.com, not-an-email, jane@example.com");
      expect(result).toEqual([
        { email: "john@example.com", displayName: null },
        { email: "jane@example.com", displayName: null },
      ]);
    });

    it("handles empty input", () => {
      expect(parseAddressListHeader("")).toEqual([]);
    });

    it("handles whitespace around addresses", () => {
      const result = parseAddressListHeader("  john@example.com  ,  jane@example.com  ");
      expect(result).toEqual([
        { email: "john@example.com", displayName: null },
        { email: "jane@example.com", displayName: null },
      ]);
    });

    it("handles comma inside angle brackets without quotes", () => {
      // Edge case: angle brackets protect the comma even without quotes
      const result = parseAddressListHeader("Team <team+tag,sub@example.com>");
      expect(result).toEqual([{ email: "team+tag,sub@example.com", displayName: "Team" }]);
    });
  });
});

describe("Sprint 3.3 — Gmail direction classification", () => {
  describe("isOutbound", () => {
    it("returns true when labelIds includes SENT", () => {
      expect(isOutbound(["SENT", "INBOX"])).toBe(true);
    });

    it("returns false when labelIds does not include SENT", () => {
      expect(isOutbound(["INBOX", "UNREAD"])).toBe(false);
    });

    it("returns false for empty labelIds", () => {
      expect(isOutbound([])).toBe(false);
    });
  });
});
