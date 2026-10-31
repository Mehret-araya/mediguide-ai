from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field


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
    section: str | None = None


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
