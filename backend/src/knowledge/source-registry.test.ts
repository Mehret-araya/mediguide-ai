
import { describe, expect, it } from "vitest";
import {
  isEligibleForRetrieval,
  validateSourceRecord,
  type HealthSourceRecord,
} from "./source-registry.js";

const pendingSource: HealthSourceRecord = {
  id: "example-source-001",
  title: "Example health document",
  publisher: "Example Publisher",
  url: "https://example.org/health-document",
  accessedDate: "2026-10-17",
  language: "en",
  topics: ["general-health"],
  reviewStatus: "pending_review",
  limitations: ["Example record used for testing only."],
};

describe("Health source registry", () => {
  it("accepts a structurally valid pending source", () => {
    expect(validateSourceRecord(pendingSource)).toEqual([]);
  });

  it("rejects a source without a valid HTTPS URL", () => {
    const source = {
      ...pendingSource,
      url: "http://example.org/health-document",
    };

    expect(validateSourceRecord(source)).toContain(
      "url must be a valid HTTPS URL.",
    );
  });

  it("rejects an invalid calendar date", () => {
    const source = {
      ...pendingSource,
      accessedDate: "2026-02-30",
    };

    expect(validateSourceRecord(source)).toContain(
      "accessedDate must use YYYY-MM-DD format.",
    );
  });

  it("rejects an unsupported review status", () => {
    const source = {
      ...pendingSource,
      reviewStatus: "trusted",
    };

    expect(validateSourceRecord(source)).toContain(
      "reviewStatus is not a supported status.",
    );
  });

  it("requires reviewer metadata for an approved source", () => {
    const source = {
      ...pendingSource,
      reviewStatus: "approved",
    };

    const errors = validateSourceRecord(source);

    expect(errors).toContain(
      "reviewer is required when a source has been reviewed.",
    );
    expect(errors).toContain(
      "reviewedAt must be a valid YYYY-MM-DD date for reviewed sources.",
    );
  });

  it("does not make pending sources eligible for retrieval", () => {
    expect(isEligibleForRetrieval(pendingSource)).toBe(false);
  });

  it("does not allow an approved record without an approval audit event", () => {
  const approvedSource: HealthSourceRecord = {
    ...pendingSource,
    reviewStatus: "approved",
    reviewer: "Test Reviewer",
    reviewedAt: "2026-10-17",
  };

  expect(validateSourceRecord(approvedSource)).toEqual([]);
  expect(isEligibleForRetrieval(approvedSource)).toBe(false);
});
  it("rejects approved records with incomplete metadata", () => {
    const invalidApprovedSource = {
      ...pendingSource,
      reviewStatus: "approved",
      reviewer: "Test Reviewer",
      reviewedAt: "2026-10-17",
      title: "",
    };

    expect(
      isEligibleForRetrieval(invalidApprovedSource),
    ).toBe(false);
  });

  it("rejects non-object source records", () => {
    expect(validateSourceRecord(null)).toEqual([
      "Source record must be an object.",
    ]);
  });
});
