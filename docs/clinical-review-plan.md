
# MediGuide AI — Clinical Review Plan

## 1. Purpose

This document defines how MediGuide AI will seek appropriate clinical review for health-related content that could affect user safety.

The purpose is to establish clear review responsibilities, evidence requirements, and release restrictions before safety-critical functionality is introduced.

This plan does not establish that a clinical reviewer has been recruited, that any content has been reviewed, or that the application is clinically validated.

## 2. Scope of Clinical Review

Clinical review may be required for:

- Emergency-related guidance.
- Content addressing potentially serious or time-sensitive symptoms.
- Safety-critical health education.
- Content that could be misunderstood as diagnosis or treatment advice.
- Medication-related educational content with meaningful safety implications.
- Health information adapted for different languages or populations.
- Other features identified as safety-critical during risk assessment.

The required level of review must reflect the content's potential consequences and intended use.

## 3. Reviewer Qualifications

Reviewers should have relevant, verifiable professional qualifications and experience appropriate to the content being reviewed.

Before assigning a review, document:

- The reviewer's professional role and relevant qualifications.
- The subject area they are qualified to assess.
- Any limitations in their expertise.
- The scope of their review responsibilities.
- Potential conflicts of interest, where relevant.

The project must not describe someone as a qualified clinical reviewer without appropriate evidence of their qualifications.

## 4. Review Materials

Provide reviewers with the materials needed to understand the proposed behavior, including:

- The exact content or rule being reviewed.
- The intended users and use context.
- The relevant approved source documents.
- Known limitations and uncertainties.
- Potential risks of incorrect or misunderstood guidance.
- Expected system behavior for representative scenarios.
- Existing test results and identified failure cases.

Reviewers must be able to distinguish fixed application rules from AI-generated responses.

## 5. Emergency Guidance Restrictions

Emergency guidance must remain separate from ordinary language-model generation.

Until the relevant rules and wording have been reviewed and approved by qualified clinical professionals:

- Treat the emergency-rule implementation as an unvalidated prototype.
- Do not present its outputs as clinically validated triage.
- Do not claim that the application can rule out emergencies.
- Do not imply that the absence of detected warning signs guarantees safety.
- Do not release unreviewed emergency rules as reliable medical guidance.

If qualified clinical review is unavailable, development may continue on general health education, privacy, source management, and technical infrastructure without claiming validated emergency functionality.

## 6. Review Workflow

The planned review process is:

1. Identify content requiring clinical review.
2. Record the intended use and associated risks.
3. Assemble the source evidence and proposed content.
4. Assign a suitably qualified reviewer.
5. Record comments, concerns, and requested changes.
6. Revise the content and relevant tests.
7. Obtain documented approval for the defined scope.
8. Record the approved version and review date.
9. Restrict release to the reviewed scope.
10. Reassess the content when evidence, implementation, or intended use changes.

Approval of one document or rule must not be interpreted as approval of unrelated content or the entire application.

## 7. Review Records

Maintain a record for each reviewed item containing, where applicable:

- Unique item identifier.
- Content or rule version.
- Reviewer's verified qualifications.
- Review scope.
- Sources considered.
- Date of review.
- Comments and identified limitations.
- Required changes.
- Final approval status.
- Date of approval.
- Date or conditions for reassessment.

Review records must be protected against unauthorized modification.

Do not publish private reviewer contact details without an appropriate reason and permission.

## 8. Language and Accessibility Review

Clinical review must consider whether users can understand the content as intended.

For safety-critical material translated into Amharic or another language, appropriate language and clinical expertise should be involved in assessing the translation.

A translation must not be described as clinically validated merely because it is grammatically correct.

AI-generated Amharic health responses must not be introduced as validated functionality until suitable clinical, language-quality, and safety evaluations have been completed.

## 9. Ongoing Review

Previously approved content may require reassessment when:

- Its supporting sources change or are withdrawn.
- Clinical recommendations change.
- The user population or intended use changes.
- New risks or failure cases are identified.
- A translation or implementation changes materially.
- User reports or evaluation results reveal possible harm.

The project should document reassessment criteria and a review schedule appropriate to the risk of each content category.

## 10. Separation from Software Testing

Software tests can verify that rules execute as intended and that system behavior matches specified conditions.

They cannot, by themselves, establish that a clinical recommendation is medically appropriate.

Clinical review, evidence assessment, technical testing, and safety evaluation are complementary activities. None should be misrepresented as a substitute for the others.

## 11. Release Gate

Before safety-critical content is released as clinically approved, the project must retain evidence that:

- The relevant content was reviewed by appropriately qualified professionals.
- The approved scope and version are identifiable.
- Review concerns were addressed or explicitly documented.
- Supporting sources and limitations were considered.
- Relevant software and safety tests were completed.
- The release does not exceed the scope of the approval.

Any required approval that has not been obtained must remain an explicit release blocker.

## 12. Current Status

This document defines a planned clinical review process.

No clinical approval, validation, or endorsement is implied by the existence of this plan. Such claims require actual documented evidence for the specific content and intended use.
