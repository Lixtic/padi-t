'use strict';
/* Account deletion. Application-owned personal data is removed atomically in one PostgreSQL statement.
   Neon Auth identity deletion follows separately; if that fails, the caller receives a retryable pending state.
   Payment rows are retained only as anonymised accounting records; blocked-account records are retained. */
const crypto = require('crypto');
const db = require('./_db');
const subjectOf = (uid) => 'u:' + crypto.createHash('sha256').update(String(uid)).digest('hex').slice(0, 24);

async function eraseAccount(me) {
  const uid = String(me.uid), email = String(me.email || '').trim().toLowerCase();
  await db.ensure();
  await db.query(`
    WITH
      d_plans AS (DELETE FROM plans WHERE user_id = $1 RETURNING 1),
      d_career_roadmaps AS (DELETE FROM career_roadmaps WHERE user_id = $1 RETURNING 1),
      d_plan_log AS (DELETE FROM plan_log WHERE subject = $2 RETURNING 1),
      d_free_plan_reservations AS (DELETE FROM free_plan_reservations WHERE subject = $2 RETURNING 1),
      d_profiles AS (DELETE FROM profiles WHERE user_id = $1 RETURNING 1),
      d_account_profiles AS (DELETE FROM account_profiles WHERE user_id = $1 RETURNING 1),
      d_parent_learning AS (DELETE FROM parent_learning WHERE user_id = $1 RETURNING 1),
      d_notifications AS (DELETE FROM notifications WHERE user_id = $1 RETURNING 1),
      d_reminder_log AS (DELETE FROM reminder_log WHERE user_id = $1 RETURNING 1),
      d_mail_optout AS (DELETE FROM mail_optout WHERE user_id = $1 RETURNING 1),
      d_account_phones AS (DELETE FROM account_phones WHERE user_id = $1 RETURNING 1),
      d_subscriptions AS (DELETE FROM subscriptions WHERE user_id = $1 RETURNING 1),
      d_bonus AS (DELETE FROM bonus WHERE user_id = $1 RETURNING 1),
      d_reward_tokens AS (DELETE FROM reward_tokens WHERE user_id = $1 RETURNING 1),
      d_feedback AS (DELETE FROM feedback WHERE user_id = $1 OR ($3 <> '' AND lower(email) = $3) RETURNING 1),
      d_accounts AS (DELETE FROM accounts WHERE user_id = $1 RETURNING 1),
      d_usage AS (DELETE FROM usage WHERE subject = $2 RETURNING 1),
      d_reservations AS (DELETE FROM quota_reservations WHERE subject = $2 RETURNING 1),
      d_otp AS (DELETE FROM otp_codes WHERE email = $3 RETURNING 1),
      d_users AS (DELETE FROM users WHERE id = $1 OR ($3 <> '' AND lower(email) = $3) RETURNING 1),
      a_payments AS (UPDATE payments SET user_id = CASE WHEN user_id = $1 THEN 'deleted' ELSE user_id END, email = '' WHERE user_id = $1 OR ($3 <> '' AND lower(email) = $3) RETURNING 1)
    SELECT
      (SELECT count(*) FROM d_plans) + (SELECT count(*) FROM d_career_roadmaps) + (SELECT count(*) FROM d_plan_log) + (SELECT count(*) FROM d_free_plan_reservations) + (SELECT count(*) FROM d_profiles) +
      (SELECT count(*) FROM d_account_profiles) + (SELECT count(*) FROM d_parent_learning) +
      (SELECT count(*) FROM d_notifications) + (SELECT count(*) FROM d_reminder_log) +
      (SELECT count(*) FROM d_mail_optout) + (SELECT count(*) FROM d_account_phones) +
      (SELECT count(*) FROM d_subscriptions) + (SELECT count(*) FROM d_bonus) +
      (SELECT count(*) FROM d_reward_tokens) + (SELECT count(*) FROM d_accounts) + (SELECT count(*) FROM d_feedback) + (SELECT count(*) FROM d_usage) +
      (SELECT count(*) FROM d_reservations) + (SELECT count(*) FROM d_otp) +
      (SELECT count(*) FROM d_users) + (SELECT count(*) FROM a_payments) AS affected
  `, [uid, subjectOf(uid), email]);

  let identityRemoved = true;
  try { await db.query('delete from neon_auth."user" where id = $1', [uid]); }
  catch (e) {
    if (!/does not exist|undefined table|undefined schema/i.test(String(e && e.message))) {
      identityRemoved = false;
      console.error('account deletion: sign-in identity still needs removal:', e && e.message);
    }
  }
  return { identityRemoved };
}
module.exports = { eraseAccount, subjectOf };
