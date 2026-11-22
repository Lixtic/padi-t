# GuidED technical retention schedule (implementation baseline)

**Status:** Technical defaults documented for engineering review. This is not a legal retention policy or DPIA approval.

## Automated expiry

The daily Vercel Cron job at 03:17 UTC calls `/api/retention`. It requires the `CRON_SECRET` environment variable and deletes only records whose expiry is already part of the application's behaviour.

| Data | Implemented expiry | Basis |
|---|---:|---|
| Email sign-in OTP codes | At `expires_at` (10-minute code lifetime) | An expired one-time code cannot be used again |
| Quota reservations | At `expires_at` (UTC day boundary plus 10 minutes) | Abandoned reservations stop holding quota |
| Generated response cache | `CACHE_TTL_DAYS`, default 30 days | Existing cache lookup TTL; expired responses are no longer eligible for reuse |
| Rate-limit buckets | 24 hours after `window_start` | Existing limiter cleanup horizon |

The cleanup returns aggregate row counts only. It does not log email addresses, cache content, keys, or learner data.

## Explicitly not purged by this job

- Parent/learner profiles, saved learning records and notifications.
- Plans, feedback, account and admin audit records.
- Payments, subscriptions and accounting evidence.
- Curriculum knowledge sources and chunks.
- News content, blocked-account records, and database/provider backups.

These records need documented purposes, approved retention periods, operational requirements, and where relevant accounting, security, safeguarding, or legal review. This implementation intentionally does not invent those periods.

## Operational requirements and limitations

- Configure `CRON_SECRET` in Vercel; without it the endpoint rejects requests.
- Confirm the cron is enabled on the deployed Vercel plan and inspect its invocation logs.
- This job does not delete database backups, Vercel logs, SMTP records, AI-provider records, or Paystack records.
- The 30-day response-cache period can be changed with `CACHE_TTL_DAYS`; the cleanup and cache lookup use the same setting.
- Review this schedule with the controller/privacy adviser before treating it as the organisation's formal policy.
