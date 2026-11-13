'use strict';
/* Account deletion. Removes what GuidEd holds about a signed-in teacher:
   plans, profile, account details, usage counters, bonus and reward records, feedback they sent, their legacy sign-in record and
   their Neon Auth sign-in (which also removes their sessions and linked accounts).
   Kept on purpose: payment records, without the email address and with the account id removed, because they are accounting records;
   and the block list, so a blocked account cannot return by deleting itself. */
const crypto = require('crypto');
const db = require('./_db');

const subjectOf = (uid) => 'u:' + crypto.createHash('sha256').update(String(uid)).digest('hex').slice(0, 24);

async function run(text, params) { await db.query(text, params); }

// Returns { identityRemoved } where identityRemoved says whether the Neon Auth user row was deleted (or never existed).
async function eraseAccount(me) {
  const uid = String(me.uid), email = String(me.email || '').trim().toLowerCase();
  await db.ensure();
  const mine = [
    'delete from plans where user_id = $1',
    'delete from profiles where user_id = $1',
    'delete from account_profiles where user_id = $1',
    'delete from subscriptions where user_id = $1',
    'delete from bonus where user_id = $1',
    'delete from reward_tokens where user_id = $1',
    'delete from feedback where user_id = $1',
    'delete from accounts where user_id = $1',
    "update payments set user_id = 'deleted', email = '' where user_id = $1",
  ];
  for (const sql of mine) await run(sql, [uid]);
  await run('delete from usage where subject = $1', [subjectOf(uid)]);
  await run('delete from quota_reservations where subject = $1', [subjectOf(uid)]);
  if (email) {
    await run('delete from otp_codes where email = $1', [email]);
    await run('delete from users where id = $1 or email = $2', [uid, email]);
    await run("update payments set email = '' where lower(email) = $1", [email]);
    await run("delete from feedback where lower(email) = $1", [email]);
  } else {
    await run('delete from users where id = $1', [uid]);
  }
  // Neon Auth keeps its users in the neon_auth schema of the same database; sessions, linked accounts and memberships cascade.
  let identityRemoved = true;
  try { await run('delete from neon_auth."user" where id = $1', [uid]); }
  catch (e) {
    // No such schema means this deployment does not use Neon Auth, which is fine. Anything else (permissions) needs a human.
    if (!/neon_auth|does not exist|relation/i.test(String(e && e.message))) { identityRemoved = false; console.error('account deletion: could not remove the sign-in record:', e && e.message); }
  }
  return { identityRemoved };
}

module.exports = { eraseAccount, subjectOf };
