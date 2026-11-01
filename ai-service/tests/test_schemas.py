import pytest
from pydantic import ValidationError

from app.schemas.health_education import (
    APIError,
    CitationSource,
    HealthEducationRequest,
    HealthEducationResponse,
)


def test_health_education_request_accepts_english_question() -> None:
    request = HealthEducationRequest(question="  What is malaria?  ")

    assert request.question == "What is malaria?"
    assert request.language == "en"


@pytest.mark.parametrize("question", ["", " ", "\n\t"])
def test_health_education_request_rejects_empty_question(
    question: str,
) -> None:
    with pytest.raises(ValidationError):
        HealthEducationRequest(question=question)


def test_health_education_request_rejects_question_over_maximum_length() -> None:
    with pytest.raises(ValidationError):
        HealthEducationRequest(question="q" * 2001)


@pytest.mark.parametrize("language", ["am", "fr", "EN"])
def test_health_education_request_rejects_unsupported_language(
    language: str,
) -> None:
    with pytest.raises(ValidationError):
        HealthEducationRequest(question="What is malaria?", language=language)


def test_health_education_request_requires_question() -> None:
    with pytest.raises(ValidationError):
        HealthEducationRequest.model_validate({})


def test_response_and_citation_schemas_serialize_api_aliases() -> None:
    response = HealthEducationResponse(
        answer="Illustrative schema test answer.",
        language="en",
        citations=[
            CitationSource(
                sourceId="test-source",
                title="Test source",
                publisher="Test publisher",
                url="https://example.org/test-source",
                section="Test section",
            )
        ],
        limitations=["Schema test only."],
        requestId="test-request-id",
    )

    assert response.model_dump(mode="json", by_alias=True) == {
        "answer": "Illustrative schema test answer.",
        "language": "en",
        "citations": [
            {
                "sourceId": "test-source",
                "title": "Test source",
                "publisher": "Test publisher",
                "url": "https://example.org/test-source",
                "section": "Test section",
            }
        ],
        "limitations": ["Schema test only."],
        "requestId": "test-request-id",
    }


def test_citation_schema_rejects_non_http_source_url() -> None:
    with pytest.raises(ValidationError):
        CitationSource(
            sourceId="test-source",
            title="Test source",
            publisher="Test publisher",
            url="not-a-url",
        )


def test_standard_api_error_schema_uses_request_id_alias() -> None:
    error = APIError(
        code="VALIDATION_ERROR",
        message="The request could not be accepted.",
        requestId="test-request-id",
    )

    assert error.model_dump(by_alias=True) == {
        "code": "VALIDATION_ERROR",
        "message": "The request could not be accepted.",
        "requestId": "test-request-id",
    }
