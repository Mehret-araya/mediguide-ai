# MediGuide AI — Medical Knowledge Source Research & Licensing Evaluation

## 1. Overview

This document records the evaluation of candidate medical knowledge sources for MediGuide AI, with a focus on public health priorities in Ethiopia.

MediGuide AI requires all health-education sources to be verified for:
1. Authoritative publisher and clinical provenance.
2. Verified publication and last-updated dates.
3. Explicit document-specific licensing terms allowing non-commercial educational reuse, text extraction, adaptation, and citation.
4. Identification and exclusion of third-party copyrighted materials (photographs, external charts, trademarks).

## 2. Publisher Landscape & Licensing Assessment

| Publisher | Authority Level in Ethiopia | Legal Reuse License | Commercial Reuse Permitted? | Status |
| :--- | :--- | :--- | :--- | :--- |
| **World Health Organization (WHO)** | **Highest Global / Regional** (Primary basis for Ethiopian national clinical guidelines) | **CC BY-NC-SA 3.0 IGO** (Open Access) | **No** (requires separate commercial agreement) | **Recommended for Non-Commercial Education** |
| **Ethiopian Ministry of Health (MoH)** | **Authoritative National Regulator** | **All Rights Reserved** (Copyright © MoH) | **No** | **Blocked**: Prohibits reproduction and adaptation without written consent |
| **Africa CDC** | **Regional Authority** (Headquartered in Addis Ababa) | **All Rights Reserved** | **No** | **Blocked**: Requires formal institutional clearance |
| **US CDC** | High (Global Scientific Reference) | **Public Domain** (US Gov Work 17 U.S.C. § 105) | **Yes** | **Caution**: Contains US-specific protocols, emergency numbers, and drug names |

### Legal Finding on Ethiopian Ministry of Health Content
While the Ethiopian Ministry of Health (`moh.gov.et`) is the primary domestic public health authority, its official terms of service state:
> *"Copyright © Ministry of Health. All rights reserved. You may view, download (for caching purposes only), and print pages for your personal, non-commercial use. You must not republish material from the website without prior written consent... nor edit/modify any material on the site."*

In accordance with MediGuide AI's knowledge base policy, permission cannot be inferred from public web availability. Consequently, Ethiopian Ministry of Health web material **must not be ingested without formal bilateral authorization**.

## 3. Verified Candidate Documents

### Candidate 1: WHO Malaria Fact Sheet
- **Publisher**: World Health Organization
- **Title**: Malaria
- **URL**: `https://www.who.int/news-room/fact-sheets/detail/malaria`
- **Publication / Last Updated**: December 4, 2025
- **Governing License**: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 IGO (CC BY-NC-SA 3.0 IGO)
- **Epidemiological Relevance**: Malaria is endemic across ~75% of Ethiopia, placing ~60% of the national population at risk.
- **Excluded Content**: Header/body photographs (e.g. credited to WHO / T. Trenchard), WHO emblem/logo, social share links.
- **Key Limitations**: General health education only. Does not provide personalized medication dosages (e.g. Artemisinin-based Combination Therapy regimens). Severe malaria is a medical emergency requiring urgent facility-based parenteral treatment.

### Candidate 2: WHO Diarrhoeal Disease Fact Sheet
- **Publisher**: World Health Organization
- **Title**: Diarrhoeal disease
- **URL**: `https://www.who.int/news-room/fact-sheets/detail/diarrhoeal-disease`
- **Publication / Last Updated**: March 7, 2024
- **Governing License**: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 IGO (CC BY-NC-SA 3.0 IGO)
- **Epidemiological Relevance**: Diarrhoeal dehydration is a leading cause of childhood mortality and malnutrition in Ethiopia. Promotes life-saving use of Oral Rehydration Salts (ORS) and Zinc supplementation.
- **Excluded Content**: Header/body photographs, hospital ward images, WHO emblem/logo.
- **Key Limitations**: General health education only. Severe dehydration is a medical emergency requiring urgent clinical care and intravenous fluids.

## 4. Compliance Checklist for CC BY-NC-SA 3.0 IGO

Under the terms of CC BY-NC-SA 3.0 IGO, MediGuide AI must:
- [x] Attribute the source using WHO's requested citation: `[Title]. Geneva: World Health Organization; [Year]. Licence: CC BY-NC-SA 3.0 IGO.`
- [x] Omit all third-party photographs, illustrations, and the WHO logo.
- [x] Ensure the application operates non-commercially.
- [x] Distribute any adapted/derived educational text corpus under the same ShareAlike license.
- [x] Include clear limitations stating that WHO does not endorse the application or its specific outputs.

