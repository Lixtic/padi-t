# Padi-T: GES lesson planner

Pick a **subject, class and week**. Padi-T writes a full Ghana Education Service package: two 60-minute lessons, study notes, BECE-style questions with a marking guide, and a rubric. You can then download it as a formatted **Word (.docx)** file.

It works on phones and desktops, has light and dark themes, and keeps a history of your plans in the browser.

## How it fits together

```
public/            the website (HTML, CSS, vanilla JS, no build step)
api/config.js      tells the site whether an AI key is set (never returns keys)
api/generate.js    streams the lesson package from your AI provider (Node)
api/export_docx.py builds the Word file (Python, python-docx)
lib/               the Word layout builder (landscape tables, shaded headers)
prompts/           the master prompt (edit this to change what Padi-T writes)
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

## Changing what Padi-T writes

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

Padi-T is an installable web app. After you deploy to Vercel (`vercel --prod`), open the site on a phone:

- **Android (Chrome):** tap **Install app** in the sidebar, or Chrome menu > Install app.
- **iPhone/iPad (Safari):** Share > **Add to Home Screen**.

It opens full screen with the Padi-T icon, loads instantly, and shows saved plans offline. Generating plans and Word export need a connection.

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
| `MAIL_FROM` | The sender shown on the email, e.g. `Padi-T <hello@yourdomain.com>`. Most providers require this address to be verified. |

Managed Auth stores identity and sessions in Neon's `neon_auth` schema. The application tables (`users`, `otp_codes`, `plans`, `profiles`) are created automatically when legacy database sync is used; `db/schema.sql` shows them if you prefer to create them yourself in the Neon SQL Editor. If the Realtime variables are also set, signed-in browsers receive live plan updates. Without the Neon variables, the app works in local/demo mode.

Managed Auth controls password sessions and email delivery. Use Neon’s production SMTP configuration before launch.

## Word export

Word files are built in the browser (`public/vendor/docx.iife.js` + `public/docx-export.js`), so export works even if the Python function is unavailable. The server route `api/export_docx.py` is kept as a fallback.
