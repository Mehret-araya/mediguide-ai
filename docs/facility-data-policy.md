
# MediGuide AI — Healthcare Facility Data Policy

## 1. Purpose

This policy defines how MediGuide AI will collect, verify, store, display, and maintain healthcare facility information.

The initial geographic focus is Addis Ababa, Ethiopia.

Incorrect facility information can delay access to care. Facility details must therefore be traceable to sources and presented with appropriate limitations.

This policy describes planned procedures. It does not mean that any facility data has already been verified.

## 2. Scope

The planned facility directory may include:
- Hospitals.
- Health centers.
- Clinics.
- Other healthcare facilities that meet the project's inclusion criteria.

The project must define facility categories and inclusion criteria before building the directory.

The directory is intended to help users discover facilities. A listing does not guarantee clinical quality, current availability, suitability for a particular condition, or emergency capability.

## 3. Source Selection

Prefer authoritative and traceable sources, including:
- Relevant Ethiopian government health agencies.
- Official facility websites or published facility information.
- Recognized public health directories.
- Other credible sources whose ownership, reliability, and update practices can be assessed.

Third-party maps and directories may help identify candidate facilities, but their information must not automatically be treated as verified.

Record the original source for each important facility detail whenever possible.

## 4. Facility Verification

Before presenting a facility as verified:

1. Confirm that the facility can be identified unambiguously.
2. Check its name against a reliable source.
3. Verify the address and geographic location when available.
4. Verify telephone numbers before displaying them as confirmed.
5. Verify opening hours before presenting them as current.
6. Confirm the source and date of verification.
7. Record unresolved discrepancies.
8. Exclude or clearly label information that cannot be verified.

Where appropriate, confirmation may require checking an official publication or contacting the facility through a verified channel.

A source that mentions a facility does not necessarily verify every detail about it.

## 5. Facility Data Model

The planned facility record should support fields such as:

- Unique internal facility identifier.
- Official or source-reported name.
- Facility category.
- Address.
- Neighborhood or administrative area.
- Geographic coordinates, when verified.
- Telephone number, when verified.
- Opening hours, when verified.
- Available services, when supported by a reliable source.
- Emergency-service information, when specifically verified.
- Source records and URLs.
- Date last verified.
- Verification status.
- Notes about uncertainty or conflicting information.
- Date created and date last updated.

Unknown information should be stored as unknown or absent, not replaced with invented values.

## 6. Verification Status

Use explicit statuses such as:

- `pending_verification`
- `verified`
- `needs_review`
- `outdated`
- `retired`

Only records meeting the appropriate verification requirements may be presented as verified.

A record marked `needs_review` or `outdated` must not silently appear as fully current.

## 7. Display Rules

The mobile application should:

- Display the facility name and address supported by its record.
- Show a verification date when available.
- Clearly identify unverified or potentially outdated information.
- Avoid describing a facility as open now unless current, reliable opening information supports that statement.
- Avoid promising that a facility offers a particular service without evidence.
- Avoid implying that a facility is appropriate for a specific patient without clinical assessment.
- Provide a way for users to recognize incomplete information.

Do not invent phone numbers, addresses, opening hours, services, ratings, or directions.

## 8. Emergency Information

Facility discovery must not replace emergency guidance or professional assessment.

Do not assume that the nearest listed facility has emergency capability.

Do not label a facility as an emergency department or claim 24-hour emergency service without reliable supporting information.

Do not invent emergency telephone numbers or claim that a service is available when this has not been verified.

Any safety-critical facility guidance must follow the project's AI safety policy and applicable clinical review requirements.

## 9. Geographic Data and Location Privacy

The initial directory is focused on Addis Ababa.

The application should request device location only when needed for a clearly explained feature and when the user has an appropriate choice.

Where possible, allow users to search by area without sharing precise device coordinates.

Do not retain precise location history by default.

If geographic coordinates are displayed or used for distance calculations, check that they correspond to the intended facility and explain relevant limitations.

## 10. Data Updates and Removal

The project should define review intervals appropriate to each data field and its potential impact.

The maintenance process should:
- Recheck records according to the documented schedule.
- Review reported errors.
- Update changed details only when supported by evidence.
- Mark records outdated when verification is no longer adequate.
- Retire facilities that are confirmed closed or no longer eligible.
- Preserve an audit trail of important changes where practical.

A record must not be considered current indefinitely just because it was verified once.

## 11. User-Reported Corrections

Users may be offered a way to report incorrect or outdated information.

User reports must be treated as leads for review, not automatic proof that a record is correct or incorrect.

Changes should be reviewed before verified information is replaced.

Avoid collecting unnecessary personal information in correction reports.

## 12. Testing Requirements

Test that:
- Every displayed facility maps to an identifiable record.
- Verified fields have supporting source information.
- Unknown fields remain unknown.
- Outdated records are handled correctly.
- Duplicate facilities can be identified and reviewed.
- Search filters return appropriate results.
- User input cannot inject arbitrary facility records.
- Facility information cannot be modified by unauthorized users.
- The application does not claim current availability without evidence.

## 13. Release Requirements

Before public release of the directory:
- Document the sources used.
- Verify the initial facility dataset.
- Review location accuracy and duplicate handling.
- Define a maintenance and correction process.
- Test display behavior for incomplete and outdated information.
- Document limitations for users.

Do not advertise the directory as complete or fully current unless evidence supports that claim.

## 14. Current Status

This policy describes planned facility-data handling.

The source registry, verification workflow, facility records, maintenance schedule, and tests must be implemented before the directory can be described as verified or current.
