
import { describe, expect, it } from "vitest";
import {
  isEligibleForRetrieval,
  type HealthSourceRecord,
  type ReviewAuditEvent,
} from "./source-registry.js";
import {
  transitionSourceReviewStatus,
  type ReviewDecision,
} from "./review-workflow.js";

const pendingSource: HealthSourceRecord = {
  id: "example-source-001",
  title: "Example health document",
  publisher: "Example Publisher",
  url: "https://example.org/health-document",
  accessedDate: "2026-10-17",
  language: "en",
  topics: ["general-health"],
  reviewStatus: "pending_review",
  limitations: ["Fictional test record."],
};

const decision: ReviewDecision = {
  reviewer: "Test Reviewer",
  reviewedAt: "2026-10-17",
  reason: "Test workflow only; not a real source approval.",
};

describe("Source review workflow", () => {
  it("allows a pending source to be approved with review evidence", () => {
    const result = transitionSourceReviewStatus(
      pendingSource,
      "approved",
      decision,
    );

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.record.reviewStatus).toBe("approved");
    expect(result.auditEvent.fromStatus).toBe("pending_review");
    expect(result.auditEvent.toStatus).toBe("approved");
    expect(result.auditEvent.reason).toBe(decision.reason);
  });

  it("records a rejection decision", () => {
    const result = transitionSourceReviewStatus(
      pendingSource,
      "rejected",
      decision,
    );

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.record.reviewStatus).toBe("rejected");
    expect(result.auditEvent.toStatus).toBe("rejected");
  });

  it("rejects an unsupported transition", () => {
    const result = transitionSourceReviewStatus(
      pendingSource,
      "retired",
      decision,
    );

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors).toContain(
      "Transition from pending_review to retired is not allowed.",
    );
  });

  it("requires a reviewer", () => {
    const result = transitionSourceReviewStatus(
      pendingSource,
      "approved",
      { ...decision, reviewer: " " },
    );

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors).toContain(
      "A reviewer is required for every status transition.",
    );
  });

  it("requires a valid review date", () => {
    const result = transitionSourceReviewStatus(
      pendingSource,
      "approved",
      { ...decision, reviewedAt: "2026-02-30" },
    );

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors).toContain(
      "The review date must be a valid YYYY-MM-DD date.",
    );
  });

  it("requires a reason for the decision", () => {
    const result = transitionSourceReviewStatus(
      pendingSource,
      "approved",
      { ...decision, reason: " " },
    );

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors).toContain(
      "A reason is required for every status transition.",
    );
  });

  it("preserves previous audit events", () => {
    const previousEvent: ReviewAuditEvent = {
      sourceId: pendingSource.id,
      fromStatus: "pending_review",
      toStatus: "rejected",
      reviewer: "First Reviewer",
      reviewedAt: "2026-10-16",
      reason: "Earlier review decision.",
    };

    const rejectedSource: HealthSourceRecord = {
      ...pendingSource,
      reviewStatus: "rejected",
      reviewer: previousEvent.reviewer,
      reviewedAt: previousEvent.reviewedAt,
    };

    const result = transitionSourceReviewStatus(
      rejectedSource,
      "pending_review",
      decision,
      [previousEvent],
    );

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.auditHistory).toHaveLength(2);
    expect(result.auditHistory[0]).toEqual(previousEvent);
    expect(result.auditHistory[1].toStatus).toBe("pending_review");
  });

  it("does not allow a retired source to change status", () => {
    const retiredSource: HealthSourceRecord = {
      ...pendingSource,
      reviewStatus: "retired",
      reviewer: "Test Reviewer",
      reviewedAt: "2026-10-17",
    };

    const result = transitionSourceReviewStatus(
      retiredSource,
      "pending_review",
      decision,
    );

    expect(result.success).toBe(false);
  });

  it("requires an approval audit event for retrieval eligibility", () => {
    const approvedSource: HealthSourceRecord = {
      ...pendingSource,
      reviewStatus: "approved",
      reviewer: decision.reviewer,
      reviewedAt: decision.reviewedAt,
    };

    expect(isEligibleForRetrieval(approvedSource)).toBe(false);

    const approvalEvent: ReviewAuditEvent = {
      sourceId: approvedSource.id,
      fromStatus: "pending_review",
      toStatus: "approved",
      reviewer: decision.reviewer,
      reviewedAt: decision.reviewedAt,
      reason: decision.reason,
    };

    expect(
      isEligibleForRetrieval(approvedSource, [approvalEvent]),
    ).toBe(true);
  });

  it("does not allow retrieval when the latest event is not approval", () => {
    const approvedSource: HealthSourceRecord = {
      ...pendingSource,
      reviewStatus: "approved",
      reviewer: decision.reviewer,
      reviewedAt: decision.reviewedAt,
    };

    const events: ReviewAuditEvent[] = [
      {
        sourceId: approvedSource.id,
        fromStatus: "pending_review",
        toStatus: "approved",
        reviewer: decision.reviewer,
        reviewedAt: decision.reviewedAt,
        reason: decision.reason,
      },
      {
        sourceId: approvedSource.id,
        fromStatus: "approved",
        toStatus: "needs_update",
        reviewer: decision.reviewer,
        reviewedAt: decision.reviewedAt,
        reason: "Source needs reassessment.",
      },
    ];

    expect(isEligibleForRetrieval(approvedSource, events)).toBe(false);
  });
});
