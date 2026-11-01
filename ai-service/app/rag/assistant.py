import re

from app.rag.chunking import validate_approved_chunk
from app.rag.retrieval import Retriever, terms
from app.schemas.health_education import (
    CitationSource,
    HealthEducationResponse,
)

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")
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
    r"recommend\b.{0,40}\b(?:medicine|medication|drug)\b.{0,30}\bfor\s+me|"
    r"prescribe(?:\s+me)?|"
    r"treat\s+my\s+(?:condition|symptom)|"
    r"what\s+do\s+my\s+symptoms\s+mean"
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
        if _PERSONAL_CLINICAL_REQUEST.search(question):
            return HealthEducationResponse(
                answer=(
                    "I can't diagnose an individual or recommend a personal "
                    "medicine or dose. Please discuss your situation with a "
                    "qualified healthcare professional."
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
        source_limitations: list[str] = []

        for passage in passages:
            validate_approved_chunk(passage.chunk)
            sentence = _select_supported_sentence(passage.chunk.text, question)
            if not sentence:
                continue
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
                        url=citation.url,
                        section=citation.section or None,
                    ),
                )
            )
            if len(excerpts) == 3:
                break

        if not excerpts:
            return HealthEducationResponse(
                answer=(
                    "I couldn't find relevant information in the approved "
                    "sources currently available to this service. Please "
                    "consult a qualified healthcare professional or an "
                    "authoritative health source."
                ),
                language="en",
                citations=[],
                limitations=[
                    "No relevant approved source passage was retrieved.",
                    "This service does not provide diagnosis or personalized treatment.",
                ],
                requestId=request_id,
            )

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
