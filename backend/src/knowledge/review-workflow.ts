
import {
  SOURCE_REVIEW_STATUSES,
  validateSourceRecord,
  type HealthSourceRecord,
  type ReviewAuditEvent,
  type SourceReviewStatus,
} from "./source-registry.js";

export interface ReviewDecision {
  reviewer: string;
  reviewedAt: string;
  reason: string;
}

export type ReviewTransitionResult =
  | {
      success: true;
      record: HealthSourceRecord;
      auditEvent: ReviewAuditEvent;
      auditHistory: ReviewAuditEvent[];
    }
  | {
      success: false;
      errors: string[];
    };

const ALLOWED_TRANSITIONS: Record<
  SourceReviewStatus,
  readonly SourceReviewStatus[]
> = {
  pending_review: ["approved", "rejected"],
  approved: ["needs_update", "retired"],
  rejected: ["pending_review", "retired"],
  needs_update: ["pending_review", "retired"],
  retired: [],
};

function isValidDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function isAuditEvent(value: unknown): value is ReviewAuditEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const event = value as Record<string, unknown>;

  return (
    typeof event.sourceId === "string" &&
    event.sourceId.trim().length > 0 &&
    typeof event.fromStatus === "string" &&
    SOURCE_REVIEW_STATUSES.includes(
      event.fromStatus as SourceReviewStatus,
    ) &&
    typeof event.toStatus === "string" &&
    SOURCE_REVIEW_STATUSES.includes(
      event.toStatus as SourceReviewStatus,
    ) &&
    typeof event.reviewer === "string" &&
    event.reviewer.trim().length > 0 &&
    isValidDate(event.reviewedAt) &&
    typeof event.reason === "string" &&
    event.reason.trim().length > 0
  );
}

export function transitionSourceReviewStatus(
  source: unknown,
  nextStatus: SourceReviewStatus,
  decision: ReviewDecision,
  auditHistory: readonly ReviewAuditEvent[] = [],
): ReviewTransitionResult {
  const sourceErrors = validateSourceRecord(source);

  if (sourceErrors.length > 0) {
    return { success: false, errors: sourceErrors };
  }

  const record = source as HealthSourceRecord;

  if (!SOURCE_REVIEW_STATUSES.includes(nextStatus)) {
    return {
      success: false,
      errors: ["The requested review status is not supported."],
    };
  }

  if (!Array.isArray(auditHistory) || !auditHistory.every(isAuditEvent)) {
    return {
      success: false,
      errors: ["Audit history contains invalid events."],
    };
  }

  const sourceEvents = auditHistory.filter(
    (event) => event.sourceId === record.id,
  );

  if (sourceEvents.length > 0) {
    const latestEvent = sourceEvents[sourceEvents.length - 1];

    if (latestEvent.toStatus !== record.reviewStatus) {
      return {
        success: false,
        errors: [
          "The latest audit event does not match the source's current status.",
        ],
      };
    }
  } else if (record.reviewStatus !== "pending_review") {
    return {
      success: false,
      errors: [
        "A reviewed source requires audit history before another transition.",
      ],
    };
  }

  if (!ALLOWED_TRANSITIONS[record.reviewStatus].includes(nextStatus)) {
    return {
      success: false,
      errors: [
        `Transition from ${record.reviewStatus} to ${nextStatus} is not allowed.`,
      ],
    };
  }

  if (
    !decision ||
    typeof decision.reviewer !== "string" ||
    decision.reviewer.trim().length === 0
  ) {
    return {
      success: false,
      errors: ["A reviewer is required for every status transition."],
    };
  }

  if (!isValidDate(decision.reviewedAt)) {
    return {
      success: false,
      errors: ["The review date must be a valid YYYY-MM-DD date."],
    };
  }

  if (
    typeof decision.reason !== "string" ||
    decision.reason.trim().length === 0
  ) {
    return {
      success: false,
      errors: ["A reason is required for every status transition."],
    };
  }

  const auditEvent: ReviewAuditEvent = {
    sourceId: record.id,
    fromStatus: record.reviewStatus,
    toStatus: nextStatus,
    reviewer: decision.reviewer.trim(),
    reviewedAt: decision.reviewedAt,
    reason: decision.reason.trim(),
  };

  const updatedRecord: HealthSourceRecord = {
    ...record,
    reviewStatus: nextStatus,
    reviewer: auditEvent.reviewer,
    reviewedAt: auditEvent.reviewedAt,
  };

  const updatedErrors = validateSourceRecord(updatedRecord);

  if (updatedErrors.length > 0) {
    return { success: false, errors: updatedErrors };
  }

  return {
    success: true,
    record: updatedRecord,
    auditEvent,
    auditHistory: [...auditHistory, auditEvent],
  };
}
