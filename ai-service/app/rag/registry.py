from datetime import date
from enum import StrEnum
from typing import Any

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator


class SourceReviewStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_UPDATE = "needs_update"
    RETIRED = "retired"


class HealthSourceRecord(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    publisher: str = Field(min_length=1)
    license: str = Field(min_length=1)
    url: AnyHttpUrl
    publication_date: date | None = Field(default=None, alias="publicationDate")
    updated_date: date | None = Field(default=None, alias="updatedDate")
    accessed_date: date = Field(alias="accessedDate")
    language: str = Field(min_length=1)
    topics: list[str] = Field(min_length=1)
    review_status: SourceReviewStatus = Field(alias="reviewStatus")
    reviewer: str | None = None
    reviewed_at: date | None = Field(default=None, alias="reviewedAt")
    limitations: list[str]
    version: str | None = None
    checksum: str | None = None

    @field_validator("url")
    @classmethod
    def require_https(cls, value: AnyHttpUrl) -> AnyHttpUrl:
        if value.scheme != "https":
            raise ValueError("Source URL must use HTTPS.")
        return value

    @field_validator("topics", "limitations")
    @classmethod
    def require_nonempty_values(cls, values: list[str]) -> list[str]:
        if any(not value.strip() for value in values):
            raise ValueError("Source metadata lists cannot contain empty values.")
        return values


class ReviewAuditEvent(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    source_id: str = Field(alias="sourceId", min_length=1)
    from_status: SourceReviewStatus = Field(alias="fromStatus")
    to_status: SourceReviewStatus = Field(alias="toStatus")
    reviewer: str = Field(min_length=1)
    reviewed_at: date = Field(alias="reviewedAt")
    reason: str = Field(min_length=1)


class SourceNotApprovedError(ValueError):
    """Raised when a document does not meet the registry approval gate."""


def require_approved_source(
    source: HealthSourceRecord | dict[str, Any],
    audit_history: list[ReviewAuditEvent | dict[str, Any]],
) -> tuple[HealthSourceRecord, ReviewAuditEvent]:
    """Match the backend registry's latest-audit-event eligibility rule."""
    record = (
        source
        if isinstance(source, HealthSourceRecord)
        else HealthSourceRecord.model_validate(source)
    )
    events = [
        event
        if isinstance(event, ReviewAuditEvent)
        else ReviewAuditEvent.model_validate(event)
        for event in audit_history
    ]

    if record.review_status is not SourceReviewStatus.APPROVED:
        raise SourceNotApprovedError("Source is not approved for retrieval.")

    source_events = [event for event in events if event.source_id == record.id]
    if not source_events:
        raise SourceNotApprovedError(
            "Source approval audit evidence is required."
        )

    latest = source_events[-1]
    if (
        latest.from_status is not SourceReviewStatus.PENDING_REVIEW
        or latest.to_status is not SourceReviewStatus.APPROVED
        or record.reviewer != latest.reviewer
        or record.reviewed_at != latest.reviewed_at
    ):
        raise SourceNotApprovedError(
            "Latest source review evidence does not authorize retrieval."
        )

    return record, latest
