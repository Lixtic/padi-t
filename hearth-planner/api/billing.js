'use strict';
// Plan status and Paystack payments.
//   GET  /api/billing?action=status    Which tier the caller is on, what is left, and the prices. Works signed out.
//   POST /api/billing?action=checkout  { plan: 'monthly' | 'term' }  Starts a Paystack payment and returns its address.
//   POST /api/billing?action=verify    { reference }  Called when the teacher returns from Paystack; unlocks Pro at once.
//   POST /api/billing?action=webhook   Called by Paystack itself (set this URL in the Paystack dashboard). Makes sure Pro is
//                                      unlocked even if the teacher closes the page before returning.
// Payments are one-off (mobile money cannot be charged automatically), and each one adds days to the teacher's Pro period.
const crypto = require('crypto');
const { sendJson, clientIp, readJson } = require('./_lib');
const A = require('./_auth');
const db = require('./_db');
const E = require('./_entitle');

const PAYSTACK = () => (process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co').replace(/\/$/, '');
const secret = () => process.env.PAYSTACK_SECRET_KEY || '';

async function paystack(path, init) {
  const r = await fetch(PAYSTACK() + path, Object.assign({}, init, { headers: Object.assign({ authorization: 'Bearer ' + secret(), 'content-type': 'application/json' }, init && init.headers) }));
  let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ }
  if (!r.ok || !j || j.status === false) throw Object.assign(new Error((j && j.message) || 'Paystack returned ' + r.status), { status: r.status });
  return j.data;
}

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 200000) throw Object.assign(new Error('Too large'), { status: 413 }); chunks.push(Buffer.from(c)); }
  return Buffer.concat(chunks);
}

// Adds the paid days to the teacher's Pro period. Safe to call twice for one payment: only the first call counts.
async function grant(reference, paidAt) {
  await db.ensure();
  const rows = await db.query("update payments set status = 'success', paid_at = $2 where reference = $1 and status <> 'success' returning user_id, plan", [reference, paidAt || Date.now()]);
  if (!rows.length) return { already: true };
  const { user_id: uid, plan } = rows[0];
  const days = (E.cfg().plans[plan] || { days: 30 }).days;
  const base = Math.max(Date.now(), await E.expiry(uid));
  const until = base + days * 86400000;
  await db.query('insert into subscriptions (user_id, expires_at, plan, updated_at) values ($1, $2, $3, $4) on conflict (user_id) do update set expires_at = excluded.expires_at, plan = excluded.plan, updated_at = excluded.updated_at', [uid, until, plan, Date.now()]);
  return { granted: true, until };
}

// Confirms with Paystack that this reference was paid in full, then unlocks Pro.
async function settle(reference, onlyFor) {
  await db.ensure();
  const rows = await db.query('select user_id, amount, currency, status from payments where reference = $1', [reference]);
  if (!rows.length) return { ok: false, code: 'unknown', message: 'We do not recognise that payment.' };
  const row = rows[0];
  if (onlyFor && row.user_id !== onlyFor) return { ok: false, code: 'forbidden', message: 'That payment belongs to another account.' };
  if (row.status === 'success') return { ok: true, already: true };
  const data = await paystack('/transaction/verify/' + encodeURIComponent(reference));
  if (data.status !== 'success') return { ok: false, code: data.status || 'pending', message: data.status === 'abandoned' || data.status === 'failed' ? 'The payment was not completed.' : 'The payment is still being confirmed.' };
  if (Number(data.amount) !== Number(row.amount) || String(data.currency) !== String(row.currency)) return { ok: false, code: 'mismatch', message: 'The amount paid does not match this plan. Contact support.' };
  await grant(reference, Date.now());
  return { ok: true };
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const action = url.searchParams.get('action') || (req.method === 'GET' ? 'status' : '');
  try {
    // Paystack calls this itself, so it is checked by its signature, not by a sign-in.
    if (action === 'webhook') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
      if (!secret()) return sendJson(res, 503, { error: 'not_configured' });
      const raw = await rawBody(req);
      const want = crypto.createHmac('sha512', secret()).update(raw).digest('hex');
      const got = String(req.headers['x-paystack-signature'] || '');
      if (want.length !== got.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))) return sendJson(res, 401, { error: 'signature' });
      let ev = null; try { ev = JSON.parse(raw.toString('utf8')); } catch (e) { /* ignore */ }
      if (ev && ev.event === 'charge.success' && ev.data && ev.data.reference) {
        const r = await settle(String(ev.data.reference)).catch((e) => { console.error('[billing] webhook settle failed', e && e.message); return null; });
        if (!r || !r.ok) { if (r) console.warn('[billing] webhook not settled', r.code); if (!r || r.code === 'pending') return sendJson(res, 500, { error: 'retry' }); }
      }
      return sendJson(res, 200, { ok: true });
    }

    const me = req.headers.authorization ? await A.authed(req).catch(() => null) : null;

    if (action === 'status') {
      if (!E.enabled()) return sendJson(res, 200, { tiers: false });
      return sendJson(res, 200, Object.assign({ tiers: true }, await E.status(me, clientIp(req))));
    }

    if (!E.enabled()) return sendJson(res, 404, { error: 'not_configured', message: 'Plans are not set up on this server.' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method', message: 'Use POST.' });
    if (!me || !me.uid) return sendJson(res, 401, { error: 'session', message: 'Please sign in first.' });
    if (!secret()) return sendJson(res, 503, { error: 'not_configured', message: 'Payments are not set up yet. Please try again later.' });
    const body = await readJson(req);

    if (action === 'checkout') {
      const key = String(body.plan || '');
      const plan = E.cfg().plans[key];
      if (!plan || !plan.amount) return sendJson(res, 400, { error: 'bad_request', message: 'Choose a plan.' });
      if (!me.email) return sendJson(res, 400, { error: 'no_email', message: 'Your account has no email address, which Paystack needs.' });
      const currency = E.cfg().currency, amount = Math.round(plan.amount * 100);   // Paystack counts in pesewas
      const reference = 'gd_' + Date.now().toString(36) + '_' + crypto.randomBytes(6).toString('hex');
      await db.ensure();
      await db.query('insert into payments (reference, user_id, email, plan, amount, currency, status, created_at) values ($1, $2, $3, $4, $5, $6, \'pending\', $7)', [reference, me.uid, me.email, key, amount, currency, Date.now()]);
      const origin = String(req.headers.origin || '') || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host));
      const data = await paystack('/transaction/initialize', { method: 'POST', body: JSON.stringify({
        email: me.email, amount, currency, reference, callback_url: origin + '/',
        metadata: { product: 'guided-pro', plan: key, user_id: me.uid },
      }) });
      return sendJson(res, 200, { url: data.authorization_url, reference });
    }

    if (action === 'verify') {
      const reference = String(body.reference || '').slice(0, 80);
      if (!reference) return sendJson(res, 400, { error: 'bad_request', message: 'Missing payment reference.' });
      const r = await settle(reference, me.uid);
      const st = await E.status(me, clientIp(req));
      return sendJson(res, r.ok ? 200 : 402, Object.assign({ tiers: true, verified: !!r.ok, message: r.message || '' }, st));
    }

    return sendJson(res, 400, { error: 'bad_request', message: 'Unknown action.' });
  } catch (e) {
    console.error('[billing]', action, e && e.message);
    return sendJson(res, e.status && e.status < 500 ? e.status : 502, { error: 'billing', message: 'Could not reach the payment service. Please try again.' });
  }
};
// The webhook signature covers the exact bytes Paystack sent, so this function must receive the body unparsed.
module.exports.config = { api: { bodyParser: false } };
