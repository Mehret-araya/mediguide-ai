from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator


class HealthEducationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    question: str = Field(min_length=1, max_length=2000)
    language: Literal["en"] = "en"


class CitationSource(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    source_id: str = Field(alias="sourceId", min_length=1)
    title: str = Field(min_length=1)
    publisher: str = Field(min_length=1)
    url: AnyHttpUrl
    license_url: AnyHttpUrl | None = Field(
        default=None,
        alias="licenseUrl",
        exclude_if=lambda value: value is None,
    )
    modification_notice: str | None = Field(
        default=None,
        alias="modificationNotice",
        min_length=1,
        exclude_if=lambda value: value is None,
    )
    section: str | None = None

    @field_validator("url", "license_url")
    @classmethod
    def require_https(cls, value: AnyHttpUrl | None) -> AnyHttpUrl | None:
        if value is not None and value.scheme != "https":
            raise ValueError("Citation URLs must use HTTPS.")
        return value


class HealthEducationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    answer: str
    language: Literal["en"]
    citations: list[CitationSource]
    limitations: list[str]
    request_id: str = Field(alias="requestId")


class APIError(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str
    message: str
    request_id: str = Field(alias="requestId")
