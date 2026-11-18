# Ghana Privacy and Data Protection Compliance Review — GuidED

**Review date:** 18 November 2026  
**Legal baseline:** Ghana Data Protection Act, 2012 (Act 843), and current Data Protection Commission (DPC) guidance  
**Review type:** Initial code-backed gap assessment; not a legal opinion, DPC audit, penetration test, or certification  
**Scope:** Learner and parent data first, plus account, teacher, payment, AI, advertising, email, and operational data where they intersect with the family experience.

## 1. Executive summary

GuidED processes personal data about adult account holders and children linked to parent accounts. The reviewed implementation stores parent display names and phone numbers, children's first names, classes and subjects, and saved learning activities that may include generated content, progress status, scores and parent notes. The service also sends some family activity details in weekly email reminders.

The current implementation has useful controls: parent endpoints authenticate the account, check that a child belongs to that account, restrict saved learning records to linked child IDs, cap the number of saved activities, and provide account/child deletion paths. Cookie consent separately gates optional advertising; analytics is currently described in the code as not installed.

However, the review identified material privacy gaps and risks that must be addressed before GuidED can claim that its learner/parent data practices are compliant:

1. Deleting an individual parent learning activity is a **soft delete**. The row is marked deleted, but its data JSON—including child name, learning content, score and notes—remains in the database.
2. Account deletion does not explicitly delete rows in the `notifications` table. Parent completion notifications can contain a child's name, subject and topic.
3. Removing a child from a parent profile deletes that child's `parent_learning` rows, but does not explicitly remove notifications previously generated for that child.
4. The Privacy Notice does not provide a sufficiently precise retention schedule for each data category, including soft-deleted activities, notifications, backups, logs and generated-response cache entries.
5. The notice identifies service providers by category/name but does not identify the actual processing locations, countries, transfer arrangements or written processor-contract status.
6. The notice does not clearly identify the legal entity/controller name and address, and does not fully provide the collection information listed in section 27(2) of Act 843 (including whether fields are mandatory or optional and the consequences of not supplying them).
7. The reviewed code does not establish a documented lawful-basis assessment for each purpose, nor a recorded parent/guardian authority or notice/consent workflow specifically for child data.
8. A documented DPIA, processing register, processor inventory and breach-response procedure were not found in the reviewed files. Their existence outside the repository has not been established.
9. The account deletion routine executes a sequence of separate database operations without an evident transaction. A mid-operation failure could leave a partially deleted account.
10. A parent learning record's delete endpoint retains the tombstone and its data. This conflicts with a user-facing expectation that deleting a saved activity removes that activity, unless a clearly disclosed and justified retention purpose exists.

**Overall preliminary risk:** High for learner-data retention and accountability gaps. This is a risk assessment based on the reviewed source, not a finding that an actual breach has occurred.

## 2. Legal and regulatory basis

The review uses the following sources:

- Data Protection Act, 2012 (Act 843), especially sections 17–31 and 35–44.
- DPC, *Guidelines to Demonstrate Data Protection Compliance* (published guidance, July 2025 PDF).
- DPC compliance guidance, including registration and DPIA guidance.

Key requirements relevant to GuidED:

| Requirement | Legal reference | GuidED review implication |
|---|---|---|
| Data protection principles | Act 843, s.17 | Demonstrate accountability, lawful processing, purpose limitation, compatible further use, data quality, openness, security and participation |
| Lawful and reasonable processing | ss.18–20 | Record a lawful justification for each purpose; do not assume cookie consent covers all processing |
| Data minimality | s.19 | Collect only data necessary, relevant and not excessive |
| Direct collection and purpose transparency | ss.21–23 | Explain collection purposes to parents/account holders and, where appropriate, learners |
| Retention | s.24 | Set and implement retention periods; do not keep identifiable records indefinitely by default |
| Quality | s.26 | Provide mechanisms to correct inaccurate parent and learner information |
| Registration and collection notice | s.27 | Confirm controller registration and give the prescribed collection information |
| Security and risk controls | s.28 | Document risks, safeguards, testing and ongoing review |
| Processor confidentiality and written contract | ss.29–30 | Verify processor instructions, confidentiality and written contractual security obligations |
| Security compromise notification | s.31 | Establish an incident process to notify the Commission and affected data subjects as soon as reasonably practicable where the statutory threshold is met |
| Data subject rights | ss.35–44 | Operationalise access, correction, objection/prevention, complaint and other applicable rights |

The DPC's current guidance states that controllers intending to process personal data must register; registration is renewed every two years. The DPC guidance also calls for a compliance programme, records of processing, processor contracts, rights-handling, breach response, retention controls and DPIA/risk assessment. The DPC states that a DPIA is appropriate for high-risk processing, new technology such as AI, and significant changes. The DPC guidance notes that small controllers may be exempt from appointing a Data Protection Supervisor under its administrative arrangements; the applicable category must be confirmed with the Commission rather than assumed.

**Important distinction:** the review does not treat every learner record as a statutory “special personal data” category. Scores and learning progress are nevertheless high-impact child data and deserve stronger safeguards. The precise statutory classification of any health, disability, biometric or other sensitive information must be assessed if such information is collected.

## 3. Confirmed data inventory from reviewed code

| Data subject | Data observed in code | Storage / processing location in application | Purpose visible in code |
|---|---|---|---|
| Parent/account holder | Neon Auth identity, email, display name, phone number, roles, parent reminder preference | Neon Auth; `account_profiles`; account/payment tables | Sign-in, account profile, parent dashboard, service communications and payment |
| Child/learner | First name, class, subjects, activity duration preference | `account_profiles.data.children` | Link a child to a parent's dashboard and tailor home learning |
| Child/learner | Child ID/name, class, subject, topic, title, generated content, status, lesson stage, score, notes, created/completed timestamps | `parent_learning.data` | Save and display home lessons, explanations, practice and progress |
| Parent/account holder | Weekly reminder preference and send history | `account_profiles.familyReminders`; `reminder_log` | Weekly family learning email |
| Child/learner | Name, class, suggested subject and recent completed activity subject/topic may appear in family email content | Email sent via configured SMTP transport | Weekly family learning reminder |
| Parent/account holder | Payment reference, email, amount, currency, status, paid date; a mobile-money number may be stored separately | `payments`; `account_phones` | Payment verification, entitlement and support |
| Teacher/account holder | Teacher profile, school, classes, subjects, saved plans and usage metadata | `profiles`, `plans`, `usage`, related tables | Lesson planning, sync, usage limits |
| Users / visitors | Request IP is used for rate limiting and guest quota identity | Request handling and quota helpers | Abuse prevention and quotas |
| Users | Cookie preference categories, version and timestamp | Browser local storage | Remember optional advertising choice |

The inventory above is based on code inspected, not a production database export. It does not establish which environment variables or third-party accounts are enabled in production.

## 4. Confirmed implementation controls

- `api/_parent-learning.js` requires authentication and a parent primary role.
- Reads are scoped to the authenticated parent user ID and filtered to child IDs in that parent's current profile.
- Saves require the submitted child ID to exist in the authenticated parent's profile; subject is checked against that child's configured subjects.
- Parent saved activities are capped at 150 active records per parent.
- `api/_account-profile.js` validates child class, subjects and name lengths, and deletes learning rows for child IDs no longer present in the profile.
- `api/_erase.js` deletes parent profiles and parent learning rows on account deletion.
- `api/generate.js` requires an authenticated parent account and a parent profile for parent-mode generation.
- `public/cookie-consent.js` keeps optional marketing/advertising disabled until a choice is recorded and leaves analytics off. This is a cookie/advertising control, not a child-data lawful-basis or guardian-authority mechanism.
- `vercel.json` includes security headers such as CSP, X-Content-Type-Options, X-Frame-Options and Referrer-Policy.

These are positive controls but do not, by themselves, demonstrate full Act 843 compliance.

## 5. Findings and remediation register

Severity definitions: **Critical** = immediate exposure or material rights failure; **High** = significant risk requiring priority remediation; **Medium** = important governance/control improvement; **Open evidence** = cannot be concluded from repository code alone.

### F-01 — Soft-deleted learner activities retain identifiable content
- **Severity:** High
- **Evidence:** `api/_parent-learning.js` handles `body.delete === true` by setting `deleted = true` and updating the timestamp. It does not clear `data` or delete the row.
- **Impact:** The UI may stop displaying the activity while the database retains the learner's name, class, content, score and parent notes. The current Privacy Notice says a parent can delete a saved activity but does not explain this retained copy.
- **Required action:** Replace content-bearing tombstones with a minimal tombstone containing only the sync identifier and deletion timestamp, or physically delete the row and implement a separate minimal sync tombstone table. Define a short, documented expiry for tombstones. Ensure API responses, backups and logs are covered by the retention policy.
- **Verification:** Add tests that confirm deleted learner content is not retained or returned, including cross-device sync behaviour.

### F-02 — Child/account deletion leaves notification records
- **Severity:** High
- **Evidence:** `api/_erase.js` deletes many account tables but does not delete from `notifications`. `api/_parent-learning.js` creates a notification whose body includes the child's name, subject and topic when an activity is completed. `api/_account-profile.js` removes learning rows for removed children but does not remove corresponding notifications.
- **Impact:** Learner-identifying notification content can remain after the parent removes a child or deletes the account.
- **Required action:** Associate child-linked notifications with a child/learning-record reference, then remove or redact them when the child or account is deleted. Add a retention policy for ordinary notifications.
- **Verification:** Add tests for child removal and account deletion that assert no child-identifying notification remains.

### F-03 — Account deletion is not visibly atomic
- **Severity:** High
- **Evidence:** `api/_erase.js` executes multiple sequential DELETE/UPDATE statements without an evident database transaction.
- **Impact:** A database or permission failure partway through can leave some personal data behind even though earlier rows were deleted.
- **Required action:** Make deletion transactional where possible, handle Neon Auth identity deletion as a separately tracked step, and return an accurate partial-completion status. Provide a retryable deletion job and audit record without retaining unnecessary personal data.
- **Verification:** Inject failures at different deletion steps and prove retry completes safely.

### F-04 — No complete retention schedule evidenced
- **Severity:** High
- **Evidence:** `MAX_SAVED = 150` is a volume cap, not a retention period. Cache lookup applies a TTL check, but the reviewed code does not establish a comprehensive purge policy for expired cache records, notifications, deleted learning records, logs, backups or provider-side copies.
- **Impact:** Personal data may be retained longer than necessary, contrary to Act 843 s.24.
- **Required action:** Approve a table-specific retention schedule with purposes, durations, deletion method, backup expiry and any lawful exceptions (for example accounting records). Implement scheduled purges and evidence logs.
- **Verification:** Automated retention tests and a production purge report.

### F-05 — Privacy Notice does not fully meet collection transparency needs
- **Severity:** High
- **Evidence:** `public/privacy.html` describes categories and providers, but the reviewed notice does not clearly state the controller's full legal name and address, mandatory/optional status of each field, consequences of not providing fields, or all data-subject rights and complaint routes.
- **Impact:** Parents and other users may not receive all information contemplated by Act 843 s.27(2) before their data is collected.
- **Required action:** Confirm the controller's legal identity and contact address; rewrite the notice and add concise just-in-time notices at parent registration, child addition, progress/score entry, AI generation, reminders and advertising choice.
- **Verification:** Map every collection field to a notice element and test that notices are accessible before submission.

### F-06 — Child-data authority and lawful-basis records are not evidenced
- **Severity:** High
- **Evidence:** `api/_account-profile.js` accepts child first name, class and subjects but the reviewed payload/schema does not include a guardian-authority declaration, notice version, child-data processing consent record or purpose-specific lawful-basis record. Cookie consent only addresses optional advertising.
- **Impact:** The operator may be unable to demonstrate who authorised the addition of a child and the legal justification for each processing purpose.
- **Required action:** Obtain Ghanaian legal advice on the correct parent/guardian authority and child transparency approach under applicable Ghanaian law. Implement a proportionate, auditable parent attestation and versioned notice/choice records where legally appropriate. Do not collect a child's birth date or identity document by default merely to create proof.
- **Verification:** Test the full parent onboarding and consent/notice evidence trail.

### F-07 — Processor contracts, countries and transfer safeguards are open evidence
- **Severity:** High
- **Evidence:** The Privacy Notice names Vercel, Neon, Paystack, SMTP and selectable AI providers, but the repository does not prove executed processor agreements, security schedules, data residency, subprocessor lists or transfer safeguards.
- **Impact:** The controller may not be able to demonstrate compliance with Act 843 ss.29–30 and the DPC's registration information about processing outside Ghana.
- **Required action:** Inventory each active provider, legal entity, role, data categories, purpose, processing country, subprocessor, retention, security terms and deletion mechanism. Obtain and review written data-processing terms and cross-border transfer advice before relying on a provider.
- **Verification:** Contract register with links/owners/review dates; production environment settings confirmed.

### F-08 — Data subject rights workflow is incomplete in the reviewed notice/code
- **Severity:** Medium–High
- **Evidence:** The notice gives a general email contact and mentions access/correction, but no complete request workflow, identity/authority verification, response tracking, objection handling or complaint escalation was evidenced in the reviewed code.
- **Impact:** Rights may be difficult to exercise consistently, particularly where a parent requests access or deletion for a child.
- **Required action:** Create a rights request process, response templates, identity/guardian verification, deadline tracking, search/export capability, correction workflow and refusal/escalation record.
- **Verification:** Simulated access, correction, objection, child-removal and account-deletion requests.

### F-09 — Weekly family emails disclose child learning details to the mail processor
- **Severity:** Medium–High
- **Evidence:** `api/_family.js` builds family reminders from child name, class, suggested subject and recently completed subject/topic data and sends them through configured SMTP.
- **Impact:** This is a further disclosure of child data to an email service and to anyone with access to the recipient mailbox. The notice should describe it precisely and the content should be minimised.
- **Required action:** Review whether the email needs the child's name and completed topic. Prefer generic parent-only prompts or minimal summaries. Make reminders opt-in by default unless a documented lawful basis and appropriate notice justify another setting. Keep an auditable preference and unsubscribe state.
- **Verification:** Review actual email template, delivery provider, opt-in UX and tests.

### F-10 — AI prompt minimisation and provider handling need verification
- **Severity:** High
- **Evidence:** `api/generate.js` sends the constructed system prompt and user conversation messages to whichever configured provider is active (Anthropic, OpenAI or Gemini). Parent-mode generation is authenticated, but the reviewed server flow does not itself strip names or other personal data from free-text prompts.
- **Impact:** A parent or teacher may enter learner-identifying details that are sent to an external AI provider. The Privacy Notice currently asks users not to enter learner names but a warning alone is not a technical control.
- **Required action:** Minimise prompt fields; remove child names and direct identifiers before provider calls where feasible; show a contextual warning; document provider retention/training settings and contractual protections; do not use identifiable learner content to train or improve models without a separately assessed lawful basis and permission.
- **Verification:** Test prompt payloads for parent mode and inspect provider account settings and agreements.

### F-11 — DPC registration and governance status are unverified
- **Severity:** High / Open evidence
- **Evidence:** No DPC registration certificate, registration number, appointed supervisor record or compliance assessment was found in the reviewed repository. This does not prove that registration has not occurred outside GitHub.
- **Required action:** Confirm the legal entity acting as controller, registration status and certificate validity directly with the organisation and DPC. Confirm the organisation's category and whether it must appoint a Data Protection Supervisor under current DPC arrangements. Maintain a compliance programme and review calendar.
- **Verification:** Record the certificate reference and expiry, supervisor decision and evidence location in a restricted compliance register.

### F-12 — Breach response and incident notification evidence is missing
- **Severity:** High / Open evidence
- **Evidence:** No incident response playbook, breach log, notification template or test was identified in the reviewed files.
- **Impact:** A compromise involving learner records may not be assessed, contained, documented or notified as required by Act 843 s.31.
- **Required action:** Establish an incident process with triage, containment, evidence preservation, risk assessment, decision log, DPC/data-subject notification and recovery. Act 843 s.31 uses “as soon as reasonably practicable”; do not substitute an unverified fixed 72-hour statutory deadline.
- **Verification:** Tabletop exercise and retained evidence of actions/timings.

### F-13 — Security posture needs a focused technical review
- **Severity:** Medium–High / Open evidence
- **Evidence:** `vercel.json` sets several browser security headers and API helpers use authenticated requests and no-store JSON responses. The repository review does not establish database role privileges, encryption-at-rest configuration, secret rotation, production log retention, backup access controls, vulnerability management, administrator MFA or penetration-test results.
- **Required action:** Complete a threat model and security assessment for parent-child access, administrator access, auth/session lifecycle, database access, backups, logs, exports and third-party integrations.
- **Verification:** Security configuration evidence, access review, automated tests and independent test report.

## 6. Priority action plan

### P0 — Before expanding learner-data processing
1. Fix F-01: remove learner content from soft-deleted activity rows.
2. Fix F-02: remove/redact child-identifying notifications on child/account deletion.
3. Fix F-03: make deletion reliable and retryable.
4. Confirm DPC registration/controller identity (F-11).
5. Establish a child-data incident response route (F-12).

### P1 — Governance and transparency
1. Approve the data inventory and lawful-basis register.
2. Complete a learner/parent DPIA before materially expanding processing.
3. Approve retention and processor/cross-border registers.
4. Update Privacy Notice and collection-time notices.
5. Implement parent/guardian authority evidence and child-appropriate transparency following Ghanaian legal advice.
6. Implement data-subject rights workflows.

### P2 — Ongoing assurance
1. Minimise family email and AI prompt payloads.
2. Review and test security controls, administrator access and backups.
3. Schedule retention purges and periodic access reviews.
4. Train personnel and conduct an annual compliance review.

## 7. Questions that require operator evidence (not answerable from GitHub)

- What is the legal name, registration number, registered office and address of the entity operating GuidED?
- Is that entity registered with the DPC? If yes, what is the certificate number, category and expiry date?
- Who is the designated privacy contact and has the DPC required/approved a Data Protection Supervisor for this organisation's size and processing volume?
- Which Vercel, Neon, Paystack, SMTP and AI provider accounts are live in production, and in which countries/regions are data processed and backed up?
- Are written processor/data-processing agreements in place with all relevant providers?
- What are the actual Neon backup retention and point-in-time recovery settings? Who can access production data?
- What is the current retention period for account data, learning records, notifications, feedback, quota/rate-limit records, response cache, logs and backups?
- Do parents receive a notice and affirm their authority to add each child? What happens when a child or parent disputes that authority?
- Are learners ever asked to provide health, disability, biometric, counselling, safeguarding or other sensitive information?
- Are parent weekly emails enabled by default in production? Which SMTP provider sends them?
- Is there a documented breach response process and has it been tested?
- Are any learner data exports or classroom integrations shared with schools or teachers?

## 8. Scope limitations and evidence standard

This assessment is based on source files inspected in the GitHub repository, not a live production database, provider console, contracts, deployment environment, DPC register search, security test or interviews with the operator. A missing file in the repository is recorded as “not evidenced”, not proof that the control does not exist.

The review must be expanded to inspect all data collection points, exports, service-worker/browser storage, admin access, support/feedback flows, payment flows, provider settings and production configuration before it is treated as final.

No production records were accessed or changed as part of this assessment. No production code behaviour was changed by this document-only review.

## 9. Official references

- Ghana Data Protection Act, 2012 (Act 843): https://ghalii.org/akn/gh/act/2012/843/eng@2012-05-18
- DPC compliance guidance: https://dpc.gov.gh/compliance/
- DPC *Guidelines to Demonstrate Data Protection Compliance* (2025): https://dataprotection.org.gh/wp-content/uploads/2025/07/GUIDELINES-TO-DEMONSTRATE-DATA-PROTECTION-COMPLIANCE-1.pdf
- DPC rights of data subjects: https://dpc.gov.gh/for-individuals/
- DPC organisation guidance: https://dpc.gov.gh/for-organisations/

**Review sign-off:** Pending operator evidence and review by a qualified Ghanaian privacy/data-protection professional.