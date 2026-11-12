# GuidEd: GES lesson planner

Pick a **subject, class and week**, from Basic 1 to SHS 3. GuidEd writes a full Ghana Education Service package: two lessons, notes, exam practice with a marking guide, and a rubric. You can then download it as a formatted **Word (.docx)** file.

It works on phones and desktops, has light and dark themes, and keeps a history of your plans in the browser.

## How it fits together

```
public/            the website (HTML, CSS, vanilla JS, no build step)
api/config.js      tells the site whether an AI key is set (never returns keys)
api/generate.js    streams the lesson package from your AI provider (Node)
api/export_docx.py builds the Word file (Python, python-docx)
lib/               the Word layout builder (landscape tables, shaded headers)
prompts/           the master prompt (edit this to change what GuidEd writes)
scripts/           build-prompt.js turns the prompt into api/_prompt.js
```

Your API key and the master prompt stay on the server. The browser never sees them.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel choose **Add New → Project** and import it. Leave the framework as **Other** and leave the build settings empty. `vercel.json` already points Vercel at `public/`.
3. Open **Settings → Environment Variables** and add **one** key (see `.env.example`):
   - `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`, or `GEMINI_API_KEY`
4. Click **Deploy** (or redeploy after adding the key).

With no key, the site still runs in **demo mode**: it shows a sample plan on a fixed topic so you can check the layout. Demo content is not real curriculum for other subjects.

### Educational image search

Study Notes illustrations are searched by concept and subject, then ranked using title and description matches. GuidEd rejects results without sufficient subject overlap and tries the next provider rather than inserting a weak match. Wikimedia Commons is the default; optional fallbacks can be enabled with `PIXABAY_API_KEY`, `PEXELS_API_KEY`, `FLICKR_API_KEY`, and, optionally, `OPENVERSE_ACCESS_TOKEN`. Openverse can be queried anonymously; its token is optional. Add any provider keys in Vercel Project Settings → Environment Variables. Each provider returns its source page and available licence/creator details; teachers should still review reuse terms.


### Curriculum knowledge retrieval

GuidEd can retrieve approved source passages from a shared Neon knowledge library and add them to generation context with source title, publisher, URL, page and trust level. Retrieval is scoped by subject, class and curriculum indicator codes. The current 966-record NaCCA indicator/exemplar export remains a separate structured curriculum index; it is not treated as a substitute for the full curriculum PDFs.

**Source policy**
- Official curriculum documents should come from NaCCA or the Ministry of Education's official domains.
- Textbooks and supplementary materials must include the matching NaCCA approval-register reference before they are labelled approved.
- Teacher resources are separate from official curriculum evidence and must not be described as NaCCA-approved unless independently verified.
- Every indexed passage retains its source URL and page number when available. Retrieved text is reference material, never executable instructions.

**Admin ingestion**
1. Configure `DATABASE_URL` and add the administrator's sign-in email to `ADMIN_EMAILS`.
2. Extract PDF or DOCX text into page/section segments using the preparation script (PDF extraction requires `pdftotext`; DOCX extraction requires `python-docx`).
3. POST the resulting JSON to `/api/admin?action=knowledge` with the administrator's Bearer token. New sources enter `pending_review` and are excluded from generation until reviewed. GET `/api/admin?action=knowledge` lists sources and their review status. After checking the source document and its metadata, POST `{ "sourceId": "...", "decision": "approve" }` or `{ "sourceId": "...", "decision": "reject" }` to `/api/admin?action=knowledge-review`. Only approved sources are retrieved. For textbooks, verify the exact title and approval reference against the NaCCA register before approving; a typed reference alone does not grant the approved-material trust label.
4. The API chunks and indexes text in Postgres full-text search. Duplicate source content is detected by checksum.

Example metadata fields: `title`, `publisher`, `sourceUrl`, `documentType` (`curriculum`, `teacher_guide`, `approved_textbook`, `approved_supplementary`, or `teacher_resource`), `subject`, `classes`, `curriculumCodes`, `license`, and `segments: [{ page, heading, text }]`.

Example for the official NaCCA Computing CCP PDF:

```bash
python3 scripts/prepare-knowledge.py ./COMPUTING.pdf \
  --title "Computing CCP Curriculum (Basic 7–9)" \
  --publisher "NaCCA, Ministry of Education" \
  --url "https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf" \
  --subject "Computing" --class "Basic 7" --class "Basic 8" --class "Basic 9" \
  --type curriculum --license "© NaCCA" --output computing-ccp.json

curl -X POST "https://YOUR-DOMAIN/api/admin?action=knowledge" \
  -H "Authorization: Bearer YOUR_ADMIN_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @computing-ccp.json
```

For approved textbooks, add `--type approved_textbook --approval-reference "exact entry from the NaCCA register"`. Do not use that type unless the title has been verified in the register.

Official starting points:
- NaCCA Common Core Programme: https://nacca.gov.gh/common-core-programme-ccp/
- NaCCA approved instructional-material register: https://nacca.gov.gh/irs/
- NaCCA Computing CCP curriculum PDF: https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf

Knowledge retrieval is additive and fail-open: if no approved source matches or the database is not configured, normal generation continues with the existing curriculum scheme/index context. Do not describe the full curriculum document corpus as indexed until the documents have actually been ingested.

### Environment variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | Your provider key. Set one. |
| `LLM_PROVIDER` | `anthropic`, `openai` or `gemini`. Only needed if you set more than one key. |
| `ANTHROPIC_MODEL` / `OPENAI_MODEL` / `GEMINI_MODEL` | Override the default model. |
| `MAX_OUTPUT_TOKENS` | Output budget per answer. Default 8000. A full package needs about 6,000 to 9,000. |
| `ACCESS_CODE` | If set, teachers must enter this code before generating. Strongly recommended for a public site, since every generation costs money. |
| `RATE_LIMIT` | Generations per IP every 10 minutes. Default 8. |
| `TOKEN_QUOTA_DAILY` | Daily token budget per signed-in teacher, or per network address when not signed in. Default 200,000 (about 14 full plans). `0` turns it off. Counts are estimates. The day runs 00:00 to 24:00 UTC, which is Ghana time. |
| `TOKEN_CAP_DAILY_GLOBAL` | Optional daily cap on all teachers together, as a brake on spend. Default 0 (off). |
| `CACHE_TTL_DAYS` | How long a saved answer is reused. Default 30. |
| `CACHE_SIMILARITY` | How alike two sets of teacher's notes must be (0 to 1) for a saved answer to be reused. Default 0.8. |
| `CACHE_DISABLED` | Set to `1` to turn the answer cache off. |

### Saved answers and daily limits

- **Cache.** When a teacher asks for a plan that was already written (same subject, class, week and options), GuidEd serves the saved answer straight away and it costs no tokens and uses none of the teacher's daily allowance. Requests with different notes are matched by their meaningful words, so "forces and motion" and "motion and forces" reuse one answer, and notes that share at least 80% of their words do too. This is word matching, not embeddings, so checking the cache never calls a model. The Regenerate button always writes a new answer and replaces the saved one. Only complete answers are saved, never one that was cut short or failed.
- **Privacy.** A request with no teacher's notes shares its answer with everyone, because it only holds the subject, class, week and options. A request with notes is saved for that teacher only (or that network address when signed out).
- **Quotas.** Each generation adds its estimated tokens to that teacher's total for the day. When the budget is used up, the teacher sees how long until it resets, and saved answers still work. Both the cache and the quotas are kept in Neon (tables `response_cache` and `usage`, created automatically), so they are shared by every serverless instance. Without `DATABASE_URL` they live in each instance's memory, which slows heavy use but is not a hard limit.
- **Content options.** The Study notes and BECE questions switches in the plan options leave those sections out of the plan to save tokens. Either can be added later with the closing suggestions.

## Changing what GuidEd writes

Edit `prompts/ges-lesson-plans.md`, then run:

```bash
node scripts/build-prompt.js
```

This regenerates `api/_prompt.js`. Commit both files. The prompt tells the model the exact table formats, so the Word export stays clean. If you change those formats, test an export.

## Using it

- **New Plan** returns to the start. The pills choose subject, class and week. The optional box takes a topic, class size or week-ending date.
- **Word (.docx)**, **PDF**, **Copy**, **Share** and **Regenerate** are on each plan. PDF is built in the browser by `public/pdf-export.js` with pdfmake (`public/vendor/pdfmake*.js`, about 1 MB, loaded the first time a PDF is made). **Share** asks for PDF or Word.
- After a plan, type a follow-up such as "make Lesson 2 shorter" or "add a revision quiz", or tap a suggestion chip. A chip like "Generate Week 4" starts a new plan.
- History is stored in this browser only. Clearing site data removes it.

## Run locally

```bash
npm i -g vercel
vercel dev
```

Use `vercel dev` so the API routes run. Opening `public/index.html` directly (or any static server) works in demo mode, but Word export is not available there.

## Notes and limits

- **Cost and time:** one package is roughly 6,000 to 9,000 output tokens and takes about a minute. `vercel.json` allows up to 300 seconds for generation. If your plan rejects that value, lower `maxDuration` for `api/generate.js`.
- **Rate limiting** is best-effort. Serverless instances do not share memory, so use `ACCESS_CODE` or Vercel's firewall for a hard limit.
- **Always review** generated plans against the NaCCA curriculum before teaching. The prompt tells the model not to invent curriculum codes, but a model can still make mistakes.
- Provider model names change over time. If you see "check the model name", set the matching `*_MODEL` variable.


## Install as a mobile app (PWA)

GuidEd is an installable web app. After you deploy to Vercel (`vercel --prod`), open the site on a phone:

- **Android (Chrome):** tap **Install app** in the sidebar, or Chrome menu > Install app.
- **iPhone/iPad (Safari):** Share > **Add to Home Screen**.

It opens full screen with the GuidEd icon, loads instantly, and shows saved plans offline. Generating plans and Word export need a connection.

For a Play Store listing, paste your deployed URL into [PWABuilder](https://www.pwabuilder.com) to get an Android package (the manifest and icons are already set up).

Files: `public/manifest.webmanifest`, `public/sw.js`, `public/pwa.js`, `public/icons/` (regenerate with `python3 scripts/make-icons.py`). After changing shell files, bump `VERSION` in `public/sw.js` so phones pick up the update.

## Brand

Savannah Green `#006A4E`, School Bus Gold `#F4B400`, Padi Indigo `#1B365D`, Warm Sand `#F5E6CA`, Clay Terracotta `#D95D39`, Nurtured Leaf `#8EA625`, Charcoal Ink `#2C2C2C`. Theme variables are at the top of `public/styles.css`.

## Accounts and sync (optional, Neon)

Teachers can create an account and sign in with email and password through Neon Managed Better Auth. Plans always stay on the device first; when database sync is enabled, sync copies them to that teacher's own rows in Neon. Every query is scoped to the signed-in teacher.

Set these environment variables in Vercel (Settings > Environment Variables), then redeploy:

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Neon Console > your project > **Connect** > copy the connection string (pooled is fine). |
| `NEON_AUTH_BASE_URL` | Branch Managed Auth URL pulled by `neon deploy`. |
| `NEON_AUTH_JWKS_URL` | Managed Auth JWKS URL pulled by `neon deploy`; keep it server-side. |
| `NEON_REALTIME_URL` | The Realtime WebSocket URL provisioned by Neon. |
| `NEON_REALTIME_SECRET` | The Realtime secret provisioned by Neon. Keep this server-only. |
| `AUTH_SECRET` | Only for the old email-code sign-in. A long random string (24+ characters). Generate one with `openssl rand -base64 32`. Changing it signs everyone out. |
| `SMTP_URL` | Only for the old email-code sign-in; not needed with Managed Auth. How to send the code emails, e.g. `smtps://USER:PASSWORD@smtp-relay.brevo.com:465` (Brevo free plan: 300 emails a day) or `smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465` (Gmail with an app password). Any SMTP provider works. |
| `MAIL_FROM` | The sender shown on the email, e.g. `GuidEd <hello@yourdomain.com>`. Most providers require this address to be verified. |

Managed Auth stores identity and sessions in Neon's `neon_auth` schema. The application tables (`users`, `otp_codes`, `plans`, `profiles`) are created automatically when legacy database sync is used; `db/schema.sql` shows them if you prefer to create them yourself in the Neon SQL Editor. If the Realtime variables are also set, signed-in browsers receive live plan updates. Without the Neon variables, the app works in local/demo mode.

Managed Auth controls password sessions and email delivery. Use Neon’s production SMTP configuration before launch.

## Word export

Word files are built in the browser (`public/vendor/docx.iife.js` + `public/docx-export.js`), so export works even if the Python function is unavailable. The server route `api/export_docx.py` is kept as a fallback.

## Sign-in through your own domain

Phones and strict browsers block cookies set by another site, which made sign-in look successful while the session was dropped
and plans never synced. GuidEd now sends Neon Auth calls through `/api/neon-auth` on your own domain (a small proxy in
`api/neon-auth.js`), so the session cookie is first-party. No new settings are needed; it uses `NEON_AUTH_BASE_URL`.
Set `NEON_AUTH_DIRECT=1` to go straight to Neon again. Your domain must still be a trusted origin in Neon Auth.

## Guest preview, Free and Pro

Plans are described by what a teacher gets, not by tokens. Every number is an environment variable (see `.env.example`).

| | Guest (no account) | Free (signed in) | Pro (paid) |
|---|---|---|---|
| Plans | A taster: Lesson 1 only, 2 a day | 3 full plans a week | Unlimited |
| Classes | 1 | 1 per week | Basic 7, 8 and 9 |
| Word files | Create an account first | With a "Made with GuidEd" footer | Clean |
| Sync across devices | No | Yes | Yes |

**Guests cost almost nothing.** A taster is short (about 700 words, capped at `PREVIEW_MAX_TOKENS`), and it goes into the shared cache, so the next visitor who asks for the same subject, class and week is served for free. Only tasters that spend tokens count against the 2 a day. Under the taster is a card that leads to creating an account.

**Paying.** Payments are one-off through [Paystack](https://paystack.com), because mobile money cannot be charged automatically. Cards, MTN MoMo, Telecel Cash and AT Money all work. Each payment adds 30 days (monthly) or 120 days (term) to the teacher's Pro period, on top of any time left.

1. Add `PAYSTACK_SECRET_KEY` in Vercel (Paystack dashboard, Settings, API Keys).
2. In the Paystack dashboard (Settings, API Keys and Webhooks), set the webhook URL to `https://YOUR-DOMAIN/api/billing?action=webhook`. This unlocks Pro even if the teacher closes the page before returning.
3. Use a test key first. Paystack's test cards and mobile money numbers are in their docs.

Use `PRO_EMAILS` to give staff and testers Pro without paying. `TIERS=off` removes every limit.


## Bug reports and suggestions

Every menu has **Report a bug or suggest an idea**. Messages are saved in the `feedback` table with the plan type, browser and app version (never plans or chats), and limited to 5 per hour per person. To read them, add your sign-in email to `ADMIN_EMAILS` in Vercel, sign in, and open **Feedback inbox** in the menu. You can reply by email, mark messages done, or delete them.

## Usage, payments, refunds and Pro reminders

- **Usage and payments** (menu, admins only, see `ADMIN_EMAILS`): new accounts, guest previews, plans written, how many guests and free teachers hit their limits, checkouts started versus completed, active Pro, money by plan, and recent payments. Counts start from the deploy that added them.
- **Refunds:** press **Refund** on a payment. GuidEd asks Paystack to refund it in full, marks it refunded, and removes the Pro days that payment bought (never below today). Teachers who want a refund use **Need a refund or help with a payment?** in their plan sheet, which sends you a message in the feedback inbox. Pro does not renew by itself, so there is nothing for a teacher to cancel. The public policy is `public/refunds.html` (full refund within 7 days; later requests case by case) — edit it if your terms differ.
- **Pro-ending warning:** in the last 7 days teachers see a banner and a warning on their plan card. Teachers also get one email 3 days before the end (change with `REMIND_DAYS`). The email needs `CRON_SECRET` and `SMTP_URL` in Vercel; without them only the in-app warning runs. Vercel Cron runs the job daily at 08:00 UTC.

## Emails
Branded HTML emails (with a plain-text twin) are built in `api/_mail.js` and sent through `SMTP_URL` / `MAIL_FROM`: a **welcome** email the first time a new account is seen (once; a mail failure never affects the app), and the **Pro-ending** reminder (3 days before, sent by the daily cron). Links use `SITE_URL` (default `https://www.guidedgh.site`). The sign-in codes and verification emails come from Neon Auth, not from here.

## Rewarded video (watch a video for one more plan)
Free teachers who have used the week's plans see **Watch a short video for 1 more plan** in the upgrade sheet. Off until you set it up. AdSense cannot show rewarded video on the web; Google **Ad Manager** can.

1. Create a Google Ad Manager account (separate from AdSense) and get it approved for rewarded ads on your site. Create an **Out-of-page → Rewarded** ad unit.
2. In Vercel set `REWARDED_ADS=gam` and `ADMANAGER_REWARDED_UNIT=/NETWORKCODE/unit_name`, then redeploy.
3. `REWARD_PER_DAY` (default 2) and `REWARD_PLANS` (default 1) set the reward. `REWARDED_ADS=test` runs a plain countdown with no ad, for trying the flow only; do not leave it on.

How it works: the page asks the server for a one-time token, plays the video, then asks the server to count it. The server only counts it if the token is the teacher's own, unused, between `REWARD_MIN_SECONDS` and 30 minutes old, and the daily cap is not reached. A bonus plan is used only after the weekly plans run out, and does not expire. Google's web rewarded ads give no server-side proof of watching, so the time check and the daily cap are the safeguards. Small sites may get few rewarded ads from Google; when none is available teachers see a friendly message and nothing is lost. Tests: `reward-test.js`, `e2e-reward.js`.

## More admin tools (menu, admins only)
**Teachers and announcements** (same `ADMIN_EMAILS` rule as the inbox):
- **Find a teacher** by part of their email: plan, Pro end date, plans this week, AI use, recent payments.
- **Give Pro days** (a gift or a fix) or **take days off**, with a note. Days never go below today. A gift shows as plan `gift`.
- **Pause account:** the teacher cannot write plans or start a payment until you **Restore** them. You cannot pause yourself.
- **Announcement:** one message (200 characters) shown at the top of the start screen to everyone, as information or important, for 1 to 14 days or until you turn it off. Teachers can dismiss it; a new message shows again. It is read through `/api/config` and cached for a minute.
- **Recent admin actions** lists who did what (table `admin_log`).
- **Usage and payments** now also shows AI use: requests, estimated tokens, a daily bar chart and the heaviest teachers (the daily counters are kept for 35 days).

## Levels: Lower Primary, Upper Primary, JHS and SHS

The class menu is grouped by level, and the subjects change with the level. Each level has its own style of plan.

| Level | Classes | Subjects | Style |
|---|---|---|---|
| Lower Primary | Basic 1 to 3 | English Language, Mathematics, Ghanaian Language, Our World Our People, Creative Arts, Religious and Moral Education, Physical Education, Computing | Play-based and mostly spoken. **Teacher's Notes** with a take-home activity, then a **Class Exercise** (oral and written). |
| Upper Primary | Basic 4 to 6 | The above, plus Science, History and French | Simple English, group work. **Study Notes**, then a **Class Exercise** (multiple choice and short answers). |
| JHS | Basic 7 to 9 | Unchanged | As before, with **BECE Practice**. |
| SHS | SHS 1 to 3 | English Language, Mathematics, General Science, Social Studies | Double-period lessons (2 × 80 minutes), deeper notes, **WASSCE Practice** with DoK levels and a marking scheme. |

- The list of levels, classes and subjects lives in `api/_levels.js`. After editing it run `node scripts/build-levels.js` (`npm run build` does it too; the generated files are committed) so the browser copy matches.
- The level profiles live in `prompts/ges-lesson-plans.md` (the `### Level:` sections). Only the matching profile is sent with a request, so JHS requests cost what they did before. Run `node scripts/build-prompt.js` after editing.
- Schemes of learning (`data/schemes.json`) are stored per class and term. Basic 1 to 6 and SHS 1 to 3 come from yearly indicator lists that `scripts/import-schemes.py` spreads over three 14-week terms in the NaCCA order (week 1 revision, weeks 2 to 12 teaching, week 13 revision, week 14 examination); Basic 7 to 9 are Term 1 files with real week numbers. The app picks the term from the calendar (Term 1 from September, Term 2 from January, Term 3 from about 20 April, see `currentTerm` in `scripts/build-schemes.js`), and a teacher can pick another with the Term button; that choice is kept per account and is dropped when the calendar moves on.

## Icons and splash screens

`node scripts/build-icons.js` draws the GuidEd mark (a white G ring with a gold guiding star, on green) into `public/favicon.svg`, `public/icons/*.png` (any, maskable and Apple touch) and `public/splash/ios-*.png` (iPhone and iPad portrait startup images, linked from `index.html`). Android builds its own launch screen from the manifest colour and icon. The installed app also shows a short in-app splash once per launch (`#splash`).

## Share a plan

The Share button on a lesson plan builds a Word file with only the Lesson Metadata table, each lesson's activity table and the Assessment Rubric (see `planTables` in `public/app.js`). Objectives lines, study or teacher's notes, exam practice and follow-ups stay out. On phones it opens the system share sheet (WhatsApp, email and so on); elsewhere it downloads the file.

## Plan the whole term

Options > "Plan the whole term" (Pro) writes every remaining week of the chosen term for the current class and subject, from the chosen week to week 13, skipping examination weeks and weeks already planned. It needs a loaded scheme of learning. Plans are written one after another as normal plans; the run waits by itself when the request limit is near, pauses with a Resume button if a week fails, and ends with a "Download term pack" button: one Word file holding each plan's lesson tables and rubric, one plan per page set (see `termRun` in `public/app.js`).

## Week-ending dates

The plan's Week Ending cell fills itself with the Friday that closes the week (`fillWeekEnding` in `public/app.js`; a date the teacher typed is left alone). Dates come from the GES calendar in `scripts/build-schemes.js` (`CALENDAR`: 2026/27 is loaded from the published GES calendar; other years are estimated from the usual pattern, so add each new year when GES publishes it). Week 1 is the week the term opens. Weeks that start after the term closes get no date. A teacher whose school opened on a different day can set it under My teacher profile > Term dates; that is saved per academic year and term and synced with the profile. The week menu shows each Friday next to the week.

The app opens on the current teaching week: the week whose Friday has not passed yet (a Saturday or Sunday counts as the coming Monday, a holiday as week 1 of the term about to open), counted from the GES calendar or the teacher's own opening date. The week menu marks it "this week". After a plan is written the pill moves on to the next week. If the teacher has chosen a term other than the current one, there is no calendar week, so it falls back to the week after the last one planned.

## Ads on the Free plan (Google AdSense)
One banner on the start screen, shown only to Guest and Free teachers. Pro never sees it, and it never appears while a plan is written, inside a plan, in a Word file or in a share. It is off until you set both in Vercel:

- `ADSENSE_CLIENT` – your publisher id, like `ca-pub-1234567890123456`
- `ADSENSE_SLOT` – the ad unit id (digits) of a responsive display unit
- `ADS_PERSONALIZED=1` – optional. Without it ads are requested as non-personalised.

Notes: the `google-adsense-account` tag and the AdSense snippet sit in the `<head>` of `index.html` so Google can verify the site. Google Auto ads can rewrite the page layout and stop scrolling, so `ads.js` undoes those edits on `<html>` and `<body>`; turn Auto ads off in AdSense (Ads → By site) as well. After the site is verified the head snippet can be removed (the ad loader adds the script itself when an ad is shown). `vercel.json` now lets the page load AdSense (script, frames, images, connections for Google ad domains); nothing else changed. AdSense must approve the site first, and Google reviews the public pages (About, Privacy), so keep them live. `public/ads.txt` holds the Google line for publisher 4853272055022457. Teachers in the EEA/UK may need a consent banner (Google's Funding Choices). An ad blocker or an unfilled ad simply hides the slot. Tests: `e2e-ads.js`.

## Curriculum Intelligence Engine (v1)

The generation API resolves the class, subject, term and week against the server-owned scheme dataset before calling the AI provider. The browser cannot submit its own curriculum record. Optional `indicatorCodes` can narrow generation to one or more indicators that actually belong to that resolved week; unknown or mismatched codes are rejected.

`api/_curriculum.js` builds the curriculum contract added to the model's system instructions. It distinguishes content-standard codes from indicator codes, applies the scheme's multi-week pacing boundary, requires measurable objectives and an objective-linked outline, and tells the model not to invent official exemplars, textbook citations or retrieved sources. Revision weeks are treated as revision only, with no new indicator invented.

`GET /api/curriculum?subject=Computing&cls=Basic%207&term=1&week=2` returns the resolved strand, sub-strand, content standard, indicator list and pacing metadata for the Teaching Studio. It labels the response `scheme_metadata_only`: the currently loaded scheme dataset is not the complete official NaCCA curriculum and does not include official exemplars or textbook passages. This endpoint therefore does not claim those materials have been retrieved.

Run `npm test` from `hearth-planner/` to check indicator-code classification, curriculum instruction construction and revision handling.

**Next data milestone:** ingest and curate the full official NaCCA curriculum documents and approved reference materials with page-level provenance. Only after that retrieval layer exists should the product claim document-grounded RAG or source-verified exemplars.
