# Preliminary Data Protection Impact Assessment — GuidED Learner and Parent Data

**Status:** Preliminary assessment for internal review; not a final DPIA or legal opinion  
**Date:** 18 November 2026  
**Controller:** To be confirmed by the operator  
**Assessment owner:** To be assigned  
**Review trigger:** Existing parent/learner data processing, AI-supported educational content, progress records and third-party cloud processing.

## 1. Why this assessment is being prepared

GuidED stores information about children linked to parent accounts and processes educational activity and progress information. It also uses AI providers to generate educational content and sends some family learning details by email. The Ghana Data Protection Commission's current guidance identifies high-risk processing, new technology such as AI and significant processing changes as circumstances where a DPIA should be considered.

This is a preliminary risk assessment to help the controller and its Ghanaian privacy adviser complete the formal assessment.

## 2. Processing description

### Data subjects
- Parents/caregivers who register and manage a family account.
- Children/learners linked to a parent account.
- Teachers and other adult account holders where their account data is relevant to the same platform.

### Personal data categories identified in reviewed code
- Parent: email, display name, phone number, role, reminder preference and account identifiers.
- Child: first name, class, selected subjects and activity duration preference.
- Child learning record: child ID/name, class, subject, topic/title, generated learning content, completion status, lesson stage, score, parent notes and timestamps.
- Email content: child's name, class, suggested subject and recent completed activity subject/topic may be included.
- Operational metadata: account identifiers, usage counters, notification records, payment references and technical request data.

No conclusion is made that GuidED currently collects statutory special personal data. The operator must confirm whether users can or do enter health, disability, safeguarding or other sensitive information in free-text fields.

### Purposes
- Parent account and child profile management.
- Generating and presenting home-learning resources.
- Saving activities and showing progress.
- Sending optional/selected family learning reminders.
- Account security, support, billing and service operation.

### Recipients and systems observed
- GuidED application and its database/authentication service (Neon).
- Hosting/platform provider (Vercel).
- Configured AI provider (Anthropic, OpenAI or Google/Gemini).
- Configured SMTP/email service.
- Paystack for payment operations.

The actual legal entities, locations, subprocessors and contracts must be confirmed.

## 3. Necessity and proportionality questions

The controller should document, for each data field:
- Why the field is needed for a defined purpose.
- Whether the same outcome can be achieved with a child alias or local-only identifier.
- Whether scores and parent notes are necessary, optional or avoidable.
- Whether family emails need a child's name and topic.
- Whether learner content can be processed without sending a direct identifier to an AI provider.
- Whether parent reminders should be opt-in by default.
- Whether the retention period is limited to the period needed for the purpose.
- Whether parents and age-appropriate learners receive clear explanations.

## 4. Preliminary risk register

| Risk | Likelihood | Impact | Preliminary level | Mitigation required |
|---|---|---|---|---|
| Deleted learning activity remains identifiable in database | High | High | High | Replace content-bearing soft delete with physical deletion or minimal tombstone; purge existing deleted rows after validation |
| Child-identifying notifications remain after child/account deletion | Medium–High | High | High | Link notifications to child/record and delete/redact on removal; account deletion must clear relevant notifications |
| Partial account deletion leaves records behind | Medium | High | High | Transactional deletion, retryable cleanup and verifiable completion |
| Learner identifiers included in AI prompt text | Medium | High | High | Data minimisation, identifier stripping where feasible, provider contractual review and contextual warnings |
| Unclear lawful basis/guardian authority | Medium | High | High | Ghanaian legal review, documented lawful-basis register and proportionate parent attestation/notice |
| Cross-border provider processing not documented | Medium | High | High | Provider and country register, written processor terms and transfer review |
| Retention periods not defined or implemented | High | High | High | Approved schedule, automated purge, backup expiry and audit evidence |
| Unauthorised parent-child or cross-parent access | Medium | High | High | Negative authorisation tests, access logging and security review |
| Child details disclosed through weekly emails | Medium | Medium–High | Medium–High | Minimise email contents, confirm recipient controls and preference/opt-in model |
| Data subject request cannot be completed consistently | Medium | Medium–High | Medium–High | Rights request workflow, identity/guardian verification, export/correction/erasure and tracking |
| Breach response not prepared | Medium | High | High | Incident playbook, contacts, notification decision tree and tabletop test |
| Admin/provider access or backups expose learner records | Unknown | High | High pending evidence | Verify RBAC, MFA, encryption, backups, secrets and vendor access |

## 5. Existing controls observed

- Parent API requires authentication and parent role.
- Parent learning reads and writes are scoped to the authenticated parent and linked child IDs.
- Parent learning record count is capped.
- Parent profile validation restricts class and subject values.
- Account deletion includes parent profile and parent-learning tables.
- CSP and several browser security headers are configured.
- Optional advertising is separately gated by a cookie-consent preference.

These controls reduce some risks but do not remove the gaps listed above.

## 6. Required mitigations before sign-off

1. Implement F-01, F-02 and F-03 from the companion compliance assessment.
2. Complete the data inventory and lawful-basis register.
3. Confirm DPC registration and the controller's legal identity.
4. Confirm provider locations, subprocessors, written agreements and transfer arrangements.
5. Approve and implement the retention schedule.
6. Update the Privacy Notice and collection-time notices.
7. Establish guardian authority and age-appropriate transparency with Ghanaian legal advice.
8. Establish data-subject rights and breach-response workflows.
9. Conduct security testing of parent-child isolation, account deletion, backups, administrator access and AI prompt payloads.

## 7. Residual risk and approval

Residual risk cannot yet be assessed because provider contracts, production settings, retention configuration, DPC registration evidence and operator practices have not been supplied.

**DPIA decision:** Not approved for final sign-off. The controller must complete the missing evidence and mitigation work, then obtain review from a qualified Ghanaian privacy/data-protection professional. If the DPC's guidance or the Commission requires submission or further review for the processing, follow that direction before proceeding.

## 8. Sign-off record

- Controller representative: Pending
- Data Protection Supervisor / privacy adviser: Pending
- Technical owner: Pending
- Legal reviewer: Pending
- Date approved: Pending
- Review date: Pending
