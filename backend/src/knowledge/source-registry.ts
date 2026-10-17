
export const SOURCE_REVIEW_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "needs_update",
  "retired",
] as const;

export type SourceReviewStatus =
  (typeof SOURCE_REVIEW_STATUSES)[number];

export interface HealthSourceRecord {
  id: string;
  title: string;
  publisher: string;
  url: string;

  publicationDate?: string;
  updatedDate?: string;
  accessedDate: string;

  language: string;
  topics: string[];
  reviewStatus: SourceReviewStatus;

  reviewer?: string;
  reviewedAt?: string;

  limitations: string[];
  version?: string;
  checksum?: string;
}
export interface ReviewAuditEvent {
  sourceId: string;
  fromStatus: SourceReviewStatus;
  toStatus: SourceReviewStatus;
  reviewer: string;
  reviewedAt: string;
  reason: string;
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value: unknown): boolean {
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

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isNonEmptyString(item))
  );
}

function hasValidHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Checks source-record structure and review metadata.
 *
 * Passing validation does not prove that a document is authentic,
 * medically accurate, or suitable for a particular answer.
 */
export function validateSourceRecord(
  record: unknown,
): string[] {
  const errors: string[] = [];

  if (!isObject(record)) {
    return ["Source record must be an object."];
  }

  const requiredStrings = [
    "id",
    "title",
    "publisher",
    "accessedDate",
    "language",
  ] as const;

  for (const field of requiredStrings) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string.`);
    }
  }

  if (!hasValidHttpsUrl(record.url)) {
    errors.push("url must be a valid HTTPS URL.");
  }

  if (!isValidDate(record.accessedDate)) {
    errors.push("accessedDate must use YYYY-MM-DD format.");
  }

  if (
    record.publicationDate !== undefined &&
    !isValidDate(record.publicationDate)
  ) {
    errors.push("publicationDate must use YYYY-MM-DD format.");
  }

  if (
    record.updatedDate !== undefined &&
    !isValidDate(record.updatedDate)
  ) {
    errors.push("updatedDate must use YYYY-MM-DD format.");
  }

  if (!isStringArray(record.topics) || record.topics.length === 0) {
    errors.push("topics must contain at least one non-empty string.");
  }

  if (!isStringArray(record.limitations)) {
    errors.push("limitations must be an array of non-empty strings.");
  }

  if (
    typeof record.reviewStatus !== "string" ||
    !SOURCE_REVIEW_STATUSES.includes(
      record.reviewStatus as SourceReviewStatus,
    )
  ) {
    errors.push("reviewStatus is not a supported status.");
  }

  if (
    record.version !== undefined &&
    !isNonEmptyString(record.version)
  ) {
    errors.push("version must be a non-empty string when provided.");
  }

  if (
    record.checksum !== undefined &&
    !isNonEmptyString(record.checksum)
  ) {
    errors.push("checksum must be a non-empty string when provided.");
  }

  if (
    record.reviewStatus !== "pending_review" &&
    SOURCE_REVIEW_STATUSES.includes(
      record.reviewStatus as SourceReviewStatus,
    )
  ) {
    if (!isNonEmptyString(record.reviewer)) {
      errors.push(
        "reviewer is required when a source has been reviewed.",
      );
    }

    if (!isValidDate(record.reviewedAt)) {
      errors.push(
        "reviewedAt must be a valid YYYY-MM-DD date for reviewed sources.",
      );
    }
  }

  return errors;
}

/**
 * Indicates whether a structurally valid, approved source record
 * is eligible for retrieval.
 *
 * This does not establish clinical quality or validate citations.
 */
export function isEligibleForRetrieval(
  record: unknown,
  auditHistory: readonly ReviewAuditEvent[] = [],
): record is HealthSourceRecord {
  if (
    !isObject(record) ||
    record.reviewStatus !== "approved" ||
    validateSourceRecord(record).length !== 0
  ) {
    return false;
  }

  const sourceEvents = auditHistory.filter(
    (event) => event.sourceId === record.id,
  );

  const latestEvent = sourceEvents[sourceEvents.length - 1];

  return (
    latestEvent !== undefined &&
    latestEvent.toStatus === "approved" &&
    latestEvent.fromStatus === "pending_review" &&
    isNonEmptyString(latestEvent.reviewer) &&
    isValidDate(latestEvent.reviewedAt) &&
    isNonEmptyString(latestEvent.reason)
  );
}