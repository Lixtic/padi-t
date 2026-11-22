# GuidEd Career Roadmaps — product architecture

## Product promise
Help a learner move from career curiosity to informed next steps. Career Roadmaps serves all learners: Basic School, SHS, TVET, tertiary students, and people exploring a career change. Discovery has two equal entry points: an open career library and an optional interest-led guide.

## Experience architecture

1. **Career Explorer** — searchable and filterable career catalogue, grouped by career family.
2. **Guided Discovery** — learners choose interests and activities they enjoy; the app suggests relevant careers without presenting the result as a psychometric assessment or limiting the learner's options.
3. **Career Profile** — plain-language overview, school subject considerations, skills, pathway stages, practical first action, and caveats.
4. **Personal Roadmap** — a future signed-in experience for saving multiple careers, choosing a preferred route, setting milestones and recording progress.
5. **Support Network** — future learner-controlled sharing with a parent, guardian, teacher or counsellor.
6. **Career Intelligence** — curated and reviewed information about Ghanaian education routes, recognised programmes, professional regulators, scholarships and labour-market context.

## Audience and tailoring

| Learner stage | Primary guidance |
|---|---|
| Basic 7–9 | Explore interests, connect subjects to possibilities, discover practical activities and build foundational skills |
| SHS | Compare programme/subject choices, tertiary and TVET routes, and admission requirements |
| TVET / apprenticeship | Understand competency routes, certification, supervised practice and progression |
| Tertiary | Compare specialisations, internships, professional requirements and early-career options |
| Career changer | Identify transferable skills, bridging learning and recognised alternative routes |

The stage-specific experience should adapt language and suggested next steps, not hide careers based on age or school level.

## Career record (target schema)

- `id`: stable slug
- `title`, `category`, `summary`, `icon`
- `interests[]`, `strengths[]`, `subjects[]`
- `routes[]`: ordered stages with `name`, `detail`, optional `stageAudience`, `duration`, `qualification`, `providerRefs[]`
- `skills[]`, `starterAction`
- `requirements[]`: structured requirements with jurisdiction, programme, issuing body, source, verification date and status
- `opportunities[]`: sectors and role examples
- `sources[]`: authoritative URLs, source owner, publication/updated date and checked date
- `reviewStatus`, `reviewedAt`, `reviewedBy`, `version`

## Personal roadmap (future persistence)

- `userId`, `careerId`, `createdAt`, `updatedAt`
- `learnerStage`, `preferredRouteId`, `targetNotes`
- `milestones[]`: milestone ID, status, target date, completed date, learner notes
- `sharing[]`: explicit recipient, permission, expiry and revocation metadata

Personal roadmaps must be private by default. Sharing is opt-in, scoped and revocable. Do not expose learner data through public career profile endpoints.

## Discovery logic

Stage 1 uses transparent interest overlap: count selected interests that overlap a career's curated interest tags, then show matching careers. It is a browsing aid, not an aptitude test, diagnosis, admission prediction or promise of job success. Never infer intelligence, ability or suitability from a learner's choices.

Later versions may add learner-selected school subjects, preferred work activities, learning preferences and constraints. Recommendations should explain why each career appeared and always allow browsing the full library.

## Ghana information and editorial governance

- Treat career profiles as orientation, not official admissions or licensing advice.
- Verify admissions against the institution's current prospectus.
- Verify professional registration and scope of practice with the relevant regulator (for example, Medical and Dental Council, Nursing and Midwifery Council, Allied Health Professions Council, National Teaching Council or ICAG as applicable).
- Verify TVET programmes, trade testing and certification with the responsible Ghanaian authority.
- Attach source links and a checked date to claims about entry requirements, accreditation, licensing, scholarships, salary and employment outlook.
- Never invent salary ranges, scholarship availability, admission cut-offs or guaranteed employment.
- Display a clear review date and flag stale or unverified records for editorial review.

## Delivery phases

### Phase 1 — Foundation (this PR)
- Public Career Roadmaps hub at `/career-roadmaps`.
- Open career library, category filter, search and saved careers on the current device.
- Optional interest-led discovery.
- Initial curated profiles with multi-stage pathways and Ghana-relevant caveats.
- Navigation entry from the GuidEd app.
- Data and UI smoke tests.

### Phase 2 — Ghana source verification (in progress)

The first expanded catalogue batch now contains 30 career profiles across technology, health, engineering, agriculture, creative industries, media, business, hospitality and education. These profiles are deliberately labelled `orientation-only`; a broad reference source is not evidence that a particular route, programme or professional requirement has been verified.
- Establish a central registry of official Ghana reference sources with source owner, purpose, URL and checked date.
- Attach source references and an explicit review state to every career profile.
- Show official reference links inside each career profile, with a warning that a source link does not itself verify a specific course or provider.
- Expand the catalogue in reviewed batches toward 100+ careers.
- Add source-backed admission routes, recognised institutions, regulators, scholarship sources and review dates only after checking the relevant official source.
- Add an editorial review workflow and stale-data checks.

The current Phase 2 implementation is a source-governance foundation, not a claim that all career pathways have been independently verified. Existing profiles remain labelled `orientation-only`. Registry records now identify the source owner, source type, evidence scope, limitations and checked date. The registry covers GTEC, CTVET, Ghana TVET Service, the Nursing and Midwifery Council, Medical and Dental Council, Allied Health Professions Council, Pharmacy Council Ghana, Veterinary Council of Ghana, National Teaching Council and ICAG. The sources are reference authorities only; no career profile is promoted to `source-reviewed` by adding a link. The exact institution, programme, qualification, validity period and applicable professional requirements must be checked before changing a career's review state.

### Phase 3 — Learner accounts and personal roadmaps
- Persist personal roadmaps and milestone progress to the signed-in account through the authenticated private sync endpoint.
- Allow guests to draft roadmaps locally; keep them on the device until they sign in.
- Track each route stage as not started, in progress or completed; allow removal of a personal roadmap.
- Add learner-stage onboarding, progress tracking and reminders.
- Preserve guest browsing and avoid requiring an account to explore.

### Phase 4 — Guided career companion
- Conversational discovery with transparent explanations.
- Compare career routes and identify practical next steps.
- Ground answers in the verified Career Intelligence catalogue; cite sources and state uncertainty.

### Phase 5 — Family and school support
- Learner-controlled parent/teacher/counsellor sharing.
- Career exploration activities for classrooms and guidance sessions.
- Aggregate, privacy-preserving insights only where appropriate.

## Current implementation boundaries
Phase 1 is a front-end foundation. Saved careers are stored in local browser storage, not synced across devices. It does not yet create an account-linked progress plan, provide verified live admissions data, or use AI to make career recommendations. The starter catalogue is deliberately small and its route descriptions must not be mistaken for official requirements.
