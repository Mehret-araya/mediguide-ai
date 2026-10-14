# MediGuide AI — Product Requirements

## 1. Project Purpose

MediGuide AI aims to help people understand general health information and identify appropriate next steps using clear language and reliable sources.

The initial target audience includes users in Ethiopia.

## 2. Intended Users

- People seeking general health education.
- Users who need clear, accessible explanations of health information.
- People looking for healthcare facilities in supported areas.

MediGuide AI is not a replacement for a qualified healthcare professional.

## 3. Version 1 Features

### 3.1 General Health Education

- Accept questions about general health topics.
- Provide understandable explanations grounded in approved sources.
- Display references to sources actually used.
- Acknowledge when reliable information is insufficient.
- Encourage professional care when appropriate.

### 3.2 Language Support

- Provide English and Amharic interface options.
- Use plain, accessible language.
- Initially generate AI answers in English.
- Evaluate the quality and safety of Amharic AI responses before introducing them.

### 3.3 User Accounts and Privacy

- Allow users to create accounts and sign in.
- Restrict private conversation history to authorized users.
- Provide appropriate data-deletion controls.
- Collect only information necessary for the application's features.

### 3.4 Healthcare Facility Discovery

- Initially focus on Addis Ababa.
- Use documented sources for facility information.
- Display verification dates where available.
- Clearly communicate when information may be incomplete or outdated.
- Never invent facility names, addresses, contact information, or opening hours.

## 4. Medical Safety Requirements

- Do not present AI-generated content as a medical diagnosis.
- Do not make personalized medication or dosage decisions.
- Do not claim that a person is safe merely because warning signs were not detected.
- Do not invent medical sources or citations.
- Keep emergency guidance independent of ordinary AI-generated responses.
- Do not present emergency guidance as clinically validated until qualified clinical professionals have reviewed it.
- Communicate limitations clearly and encourage appropriate professional care.

## 5. Knowledge and Citations

- Maintain a registry of approved health-information sources.
- Record source titles, publishers, URLs, and publication or review dates where available.
- Retrieve relevant source material before generating evidence-grounded answers.
- Display citations only when the cited sources were actually retrieved and support the claims.
- Test answers for accuracy and consistency with their sources.

## 6. Security and Privacy

- Keep API keys and database credentials out of mobile application code and Git.
- Authenticate users and authorize access to private data.
- Validate inputs and limit abusive requests.
- Test access controls and sensitive-data handling.
- Document backup and restoration procedures before production release.

## 7. Testing Requirements

- Test backend functions and API endpoints.
- Test authentication and authorization.
- Evaluate retrieval quality and citation integrity.
- Test unsafe requests and unsupported questions.
- Test mobile usability and accessibility.
- Conduct security and privacy testing before release.
- Obtain appropriate clinical review for emergency guidance.

## 8. Out of Scope for Version 1

- Replacing doctors or other healthcare professionals.
- Definitive disease diagnosis.
- Personalized prescriptions or dosage recommendations.
- Unreviewed emergency triage presented as reliable medical guidance.
- Unverified healthcare facility listings.
- Unsupported claims of clinical validation.

## 9. Release Conditions

Before public release, document the safety evaluation, source-quality checks, privacy controls, security testing, facility-data verification, and clinical review process applicable to the released features.

Successful software tests alone do not establish clinical safety or effectiveness.

## 10. Current Status

This document describes planned requirements. It does not mean the features have been implemented, tested, or clinically validated.