import re

from pydantic import AnyHttpUrl, TypeAdapter

from app.rag.chunking import validate_approved_chunk
from app.rag.retrieval import Retriever, terms
from app.schemas.health_education import (
    CitationSource,
    HealthEducationResponse,
)

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")
_HTTP_URL_ADAPTER = TypeAdapter(AnyHttpUrl)
_NEGATION_TERMS = {"no", "not", "never", "cannot"}
_OUTDATED_LIMITATION = re.compile(
    r"\b(outdated|superseded|expired|withdrawn|retired|needs?\s+updat(?:e|ing))\b",
    re.IGNORECASE,
)
_PERSONAL_CLINICAL_REQUEST = re.compile(
    r"\b("
    r"diagnos(?:e|is|ing)\s+(?:me|my|this)|"
    r"do\s+i\s+have|"
    r"could\s+i\s+have|"
    r"what\s+(?:medicine|medication|dose|dosage)\b.{0,40}\b(?:should\s+i|for\s+me)|"
    r"what\s+should\s+i\s+take|"
    r"should\s+i\s+take|"
    r"how\s+much\b.{0,40}\b(?:medicine|medication|drug)|"
    r"which\s+(?:medicine|medication|drug)\b.{0,40}\b(?:take|use|for\s+me)|"
    r"(?:should|can|could|may)\s+i\s+(?:start|stop|change|adjust|increase|decrease|skip|switch|double|halve)\s+(?:(?:taking|using)\s+)?(?:my\s+)?(?:[a-z-]+\s+){0,3}(?:medicine|medication|drug|dose|dosage)\b|"
    r"recommend\b.{0,40}\b(?:medicine|medication|drug)\b.{0,30}\bfor\s+me|"
    r"prescribe(?:\s+me)?|"
    r"treat\s+my\s+(?:condition|symptom)|"
    r"what\s+do\s+my\s+symptoms\s+mean"
    r")\b",
    re.IGNORECASE,
)
_URGENT_EMERGENCY_REQUEST = re.compile(
    r"\b("
    r"(?:i(?:'m|\s+am)|someone(?:\s+is)?)\s+(?:having|experiencing)\s+(?:a\s+)?(?:heart\s+attack|stroke|seizure|anaphylaxis|anaphylactic|overdose|emergency)|"
    r"(?:chest\s+pain|difficulty\s+breathing|can(?:'t|not)\s+breathe|shortness\s+of\s+breath)\b.{0,60}\b(?:right\s+now|help|emergency|urgent|severe|sudden)|"
    r"(?:right\s+now|help|emergency|urgent|severe|sudden)\b.{0,60}\b(?:chest\s+pain|difficulty\s+breathing|can(?:'t|not)\s+breathe|shortness\s+of\s+breath)|"
    r"call\s+(?:an?\s+)?ambulance|"
    r"(?:i(?:'m|\s+am)|someone(?:\s+is)?)\s+(?:dying|unconscious|not\s+breathing|bleeding\s+(?:heavily|severely|uncontrollably))|"
    r"what\s+(?:do\s+i\s+do|should\s+i\s+do)\s+(?:in\s+an?\s+)?emergency|"
    r"emergency\s+(?:help|assistance|treatment|care)\b"
    r")\b",
    re.IGNORECASE,
)

_GENERAL_LIMITATIONS = [
    "This is general health information, not a diagnosis or personalized treatment advice.",
    "The response uses retrieved source text and may not cover all relevant context.",
]


class HealthAssistant:
    def __init__(self, retriever: Retriever) -> None:
        self._retriever = retriever

    async def answer(
        self,
        question: str,
        *,
        request_id: str,
    ) -> HealthEducationResponse:
        if _URGENT_EMERGENCY_REQUEST.search(question):
            return HealthEducationResponse(
                answer=(
                    "This service cannot respond to emergencies. "
                    "If you or someone else is in immediate danger, "
                    "call your local emergency number (such as 911 or 112) "
                    "or go to the nearest emergency department immediately."
                ),
                language="en",
                citations=[],
                limitations=[
                    "This service provides general health education only and cannot respond to emergencies.",
                    "Emergency guidance has not been clinically reviewed and must not be relied upon in a crisis.",
                ],
                requestId=request_id,
            )

        if _PERSONAL_CLINICAL_REQUEST.search(question):
            return HealthEducationResponse(
                answer=(
                    "I can't diagnose an individual or make personal "
                    "medicine, dose, or treatment decisions. Please discuss "
                    "your situation with a qualified healthcare professional."
                ),
                language="en",
                citations=[],
                limitations=[
                    "This service provides general health education only."
                ],
                requestId=request_id,
            )

        passages = await self._retriever.retrieve(question, limit=3)
        excerpts: list[tuple[str, CitationSource]] = []
        seen: set[tuple[str, str]] = set()
        candidate_sentences: list[str] = []
        source_limitations: list[str] = []

        for passage in passages:
            try:
                validate_approved_chunk(passage.chunk)
            except (ValueError, Exception):
                continue
            if any(
                _OUTDATED_LIMITATION.search(limitation)
                for limitation in passage.chunk.source_metadata.limitations
            ):
                continue
            sentence = _select_supported_sentence(passage.chunk.text, question)
            if not sentence:
                continue
            candidate_sentences.append(sentence)
            citation = passage.chunk.citation
            citation_key = (citation.source_id, citation.section)
            if citation_key in seen:
                continue
            seen.add(citation_key)
            source_limitations.extend(
                passage.chunk.source_metadata.limitations
            )
            excerpts.append(
                (
                    sentence,
                    CitationSource(
                        sourceId=citation.source_id,
                        title=citation.title,
                        publisher=citation.publisher,
                        url=_HTTP_URL_ADAPTER.validate_python(citation.url),
                        licenseUrl=(
                            _HTTP_URL_ADAPTER.validate_python(
                                str(passage.chunk.source_metadata.license_url)
                            )
                            if passage.chunk.source_metadata.license_url is not None
                            else None
                        ),
                        modificationNotice=(
                            passage.chunk.source_metadata.modification_notice
                        ),
                        section=citation.section or None,
                    ),
                )
            )
            if len(excerpts) == 3:
                break

        if _contains_explicit_contradiction(candidate_sentences):
            return _abstention_response(request_id)

        if not excerpts:
            return _abstention_response(request_id)

        answer = "Retrieved source passages:\n\n" + "\n\n".join(
            excerpt for excerpt, _citation in excerpts
        )
        return HealthEducationResponse(
            answer=answer,
            language="en",
            citations=[citation for _excerpt, citation in excerpts],
            limitations=list(
                dict.fromkeys([*_GENERAL_LIMITATIONS, *source_limitations])
            ),
            requestId=request_id,
        )


def _select_supported_sentence(text: str, question: str) -> str | None:
    question_terms = set(terms(question))
    sentences = [
        sentence.strip()
        for sentence in _SENTENCE_BOUNDARY.split(text.strip())
        if sentence.strip()
    ]
    scored = [
        (
            len(question_terms.intersection(terms(sentence))),
            sentence,
        )
        for sentence in sentences
    ]
    supported = [result for result in scored if result[0] > 0]
    if not supported:
        return None
    return max(supported, key=lambda result: result[0])[1]


def _contains_explicit_contradiction(sentences: list[str]) -> bool:
    claims: dict[tuple[str, ...], bool] = {}
    for sentence in sentences:
        words = re.findall(r"[a-z0-9]+", sentence.lower())
        normalized = tuple(
            term
            for term in terms(sentence)
            if term not in _NEGATION_TERMS
        )
        if len(normalized) < 2:
            continue
        negated = any(word in _NEGATION_TERMS for word in words)
        previous = claims.get(normalized)
        if previous is not None and previous != negated:
            return True
        claims[normalized] = negated
    return False


def _abstention_response(request_id: str) -> HealthEducationResponse:
    return HealthEducationResponse(
        answer=(
            "I couldn't find sufficiently reliable, consistent information "
            "in the approved sources currently available to this service. "
            "Please consult a qualified healthcare professional or an "
            "authoritative health source."
        ),
        language="en",
        citations=[],
        limitations=[
            "No sufficiently relevant and consistent approved source passage was available.",
            "This service does not provide diagnosis or personalized treatment.",
        ],
        requestId=request_id,
    )
