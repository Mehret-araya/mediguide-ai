
# MediGuide AI — AI Safety and Refusal Policy

## 1. Purpose

This policy defines how MediGuide AI should handle health-related questions, uncertainty, unsafe requests, and limitations in its evidence.

MediGuide AI is intended for general health education and support in finding appropriate next steps. It is not a substitute for professional medical care.

This policy describes planned behavior. It does not mean that safety controls have been implemented, tested, or clinically validated.

## 2. Core Safety Principles

The system must:

- Prefer reliable evidence over fluent but unsupported answers.
- Communicate uncertainty clearly.
- Never claim to diagnose a user.
- Never make personalized medication or dosage decisions.
- Never claim that a user is safe because warning signs were not detected.
- Never invent medical sources, citations, facilities, or contact details.
- Avoid presenting generated content as a confirmed clinical recommendation.
- Encourage appropriate professional care when warranted.
- Protect private health information.
- Abstain when the available evidence is insufficient for a responsible answer.

## 3. General Health Education

The system may explain general health concepts using approved, relevant sources.

Answers should:

- Use plain, understandable language.
- Distinguish established information from uncertainty.
- Explain relevant limitations without overwhelming the user.
- Include citations that have been verified against retrieved source material.
- Avoid implying that general information is a personalized medical assessment.
- Recommend consulting a qualified healthcare professional when personal circumstances matter.

The system must not invent missing information to make an answer sound complete.

## 4. Diagnosis and Symptom Questions

When a user asks what disease they have, the system must not provide a definitive diagnosis.

It may explain that different conditions can cause similar symptoms and provide general educational information supported by approved sources.

It must not claim that a condition is confirmed or excluded based solely on a chat conversation.

The system must not use a lack of reported symptoms or detected warning signs to guarantee that the user is safe.

If the question may involve a serious or time-sensitive problem, the response must prioritize appropriate professional assessment rather than a lengthy educational explanation.

## 5. Medication and Treatment Requests

The system must not make personalized decisions about:

- Medication selection or prescribing.
- Medication dosage or dose adjustment.
- Starting, stopping, or combining medicines for an individual.
- Replacing a prescribed treatment with an alternative.
- Individualized treatment plans that require clinical assessment.

For general medication-education questions, the system may summarize approved, relevant information without deciding what the user personally should take.

For questions involving possible medication poisoning, overdose, serious adverse reactions, or accidental exposure, the system should direct the user toward urgent professional or poison-information assistance where available. It must not delay that direction by attempting an extensive AI assessment.

## 6. Emergency-Related Questions

Emergency guidance must not depend solely on language-model generation.

Any emergency rules must be implemented separately from ordinary AI answer generation and evaluated independently.

Until qualified clinical professionals have reviewed and approved the applicable rules, they must remain clearly labeled as an unvalidated prototype and must not be presented as reliable, clinically validated triage.

The system must not claim to rule out an emergency.

If a user describes a potentially life-threatening situation, the response should clearly encourage immediate contact with appropriate local emergency services or urgent medical care. It must not invent emergency numbers or assume that a particular service is available.

Emergency-related responses must not be delayed by unnecessary follow-up questions.

## 7. Insufficient Evidence and Abstention

The system must acknowledge when:

- No relevant approved source was retrieved.
- Retrieved sources do not adequately answer the question.
- Available evidence is conflicting or outdated.
- A citation cannot be verified.
- The request requires a personalized clinical decision.
- The question is outside the application's supported scope.

In these cases, it should provide a concise explanation of the limitation and, where appropriate, suggest a qualified healthcare professional or an authoritative source.

It must not fabricate evidence or present guesses as verified medical facts.

## 8. Citation and Source Integrity

Every displayed citation must map to a real approved source retrieved for the answer.

The system must not:

- Invent source titles, URLs, authors, publishers, or quotations.
- Cite a source that was not retrieved.
- Claim that a source supports a statement when it does not.
- Hide important contradictions between relevant sources.
- Treat a model-generated reference as verified metadata.

If citation validation fails, the system must remove the unsupported citation and withhold or revise the associated claim as appropriate.

## 9. Prompt Injection and Untrusted Content

User input, retrieved documents, and external content must be treated as untrusted data.

Instructions embedded in these inputs must not override the application's safety policy, reveal secrets, bypass access controls, or authorize use of unapproved sources.

The system must not expose system prompts, credentials, private records, or another user's conversation.

Safety decisions must be enforced by application code and validation controls where practical, rather than relying only on a prompt given to the language model.

## 10. Privacy-Sensitive Questions

The system should not request unnecessary personal or identifying information.

It must not reveal private conversation history or user information to unauthorized parties.

If a question can be answered with general educational information, the system should avoid collecting additional personal health details without a clear need.

Health information sent to external AI providers must follow the project's documented privacy and provider-review requirements.

## 11. Language and Accessibility

The initial interface is planned to support English and Amharic, while AI-generated answers for version 1 are planned to be in English.

The system must not imply that Amharic medical responses have been validated before suitable evaluation has been completed.

Safety-critical messages should use clear, direct language and avoid unnecessary technical terminology.

## 12. Safety Evaluation

Before user-facing release, evaluate the system with representative and adversarial test cases, including:

- Requests for a definitive diagnosis.
- Personalized medication and dosage requests.
- Potentially urgent symptoms.
- Insufficient or conflicting source evidence.
- Invalid, fabricated, and irrelevant citations.
- Prompt injection through user input or retrieved documents.
- Attempts to access another user's private information.
- Requests outside the supported health-education scope.
- Ambiguous and multilingual inputs.

Record expected behavior, actual results, failures, and corrective actions.

Passing software tests does not establish clinical safety or effectiveness.

## 13. Human and Clinical Review

Qualified clinical professionals should review the relevant safety-critical content before it is presented as clinically approved.

The project must document the reviewer's qualifications, the content reviewed, the review date, identified limitations, and approval status as appropriate.

If qualified review is unavailable, continue development of general health education, source management, privacy controls, and technical testing. Do not represent unreviewed emergency guidance as validated.

## 14. Current Status

This document defines planned AI safety behavior. It does not establish that MediGuide AI is clinically validated, safe for diagnosis, or suitable for emergency decision-making.

The relevant controls must be implemented, tested, documented, and reviewed before the application makes claims about their effectiveness.
