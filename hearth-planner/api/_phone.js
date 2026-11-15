'use strict';
// Ghana mobile money numbers: stored per account so checkout can send the payment prompt straight to the phone.
// Paystack's Ghana mobile money wants the local format (0551234987) and a provider: mtn, vod (Telecel) or atl (AirtelTigo).
const PREFIX = {
  mtn: ['024', '025', '053', '054', '055', '059'],
  vod: ['020', '050'],
  atl: ['026', '027', '056', '057'],
};
const PROVIDERS = Object.keys(PREFIX);

// "+233 55 123 4987", "233551234987" and "0551234987" all become "0551234987"; anything else is null.
function normalize(input) {
  let d = String(input || '').replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00233')) d = d.slice(2);
  if (d.startsWith('233') && d.length === 12) d = '0' + d.slice(3);
  else if (/^\d{9}$/.test(d)) d = '0' + d;
  return /^0\d{9}$/.test(d) && providerOf(d) ? d : null;
}
function providerOf(phone) {
  const p = String(phone || '').slice(0, 3);
  return PROVIDERS.find((k) => PREFIX[k].includes(p)) || null;
}
const mask = (phone) => phone ? phone.slice(0, 3) + ' *** ' + phone.slice(-3) : '';

async function get(db, uid) {
  const [row] = await db.query('select phone, provider from account_phones where user_id = $1', [uid]);
  return row ? { phone: row.phone, provider: row.provider } : null;
}
async function save(db, uid, phone, provider) {
  await db.query('insert into account_phones (user_id, phone, provider, updated_at) values ($1, $2, $3, $4) on conflict (user_id) do update set phone = excluded.phone, provider = excluded.provider, updated_at = excluded.updated_at', [uid, phone, provider, Date.now()]);
}
const clear = (db, uid) => db.query('delete from account_phones where user_id = $1', [uid]);

module.exports = { normalize, providerOf, mask, get, save, clear, PROVIDERS };
