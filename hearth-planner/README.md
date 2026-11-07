# GuidEd: GES lesson planner

Pick a **subject, class and week**. GuidEd writes a full Ghana Education Service package: two 60-minute lessons, study notes, BECE-style questions with a marking guide, and a rubric. You can then download it as a formatted **Word (.docx)** file.

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
- **Word (.docx)**, **Copy** and **Regenerate** are on each plan.
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
- **Refunds:** press **Refund** on a payment. GuidEd asks Paystack to refund it in full, marks it refunded, and removes the Pro days that payment bought (never below today). Teachers who want a refund use **Need a refund or help with a payment?** in their plan sheet, which sends you a message in the feedback inbox. Pro does not renew by itself, so there is nothing for a teacher to cancel.
- **Pro-ending warning:** in the last 7 days teachers see a banner and a warning on their plan card. Teachers also get one email 3 days before the end (change with `REMIND_DAYS`). The email needs `CRON_SECRET` and `SMTP_URL` in Vercel; without them only the in-app warning runs. Vercel Cron runs the job daily at 08:00 UTC.
