'use strict';
const { sendJson, readJson } = require('./_lib');
const db = require('./_db');
const A = require('./_auth');
const Levels = require('./_levels');

const SUBJECTS = new Set(Levels.LEVELS.flatMap((level) => level.subjects));
const BASIC_CLASS = /^Basic [1-9]$/;
const ROLES = new Set(['teacher', 'parent']);
const cleanText = (value, max) => String(value || '').trim().slice(0, max);

// Shared account-role handler, routed through /api/sync to keep the deployment function count down.
module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'method', message: 'Use GET or POST.' });
  }
  if (!A.syncConfigured()) return sendJson(res, 503, { error: 'not_configured', message: 'Accounts are not configured on this server.' });
  const me = await A.authed(req);
  if (!me) return sendJson(res, 401, { error: 'auth', message: 'Please sign in again.' });

  try {
    await db.ensure();
    if (req.method === 'GET') {
      const [row] = await db.query('select data, updated_at from account_profiles where user_id = $1', [me.uid]);
      return sendJson(res, 200, { profile: row ? { ...row.data, updatedAt: Number(row.updated_at) } : null });
    }

    let body;
    try { body = await readJson(req, 50000); }
    catch (e) { return sendJson(res, e.status || 400, { error: 'bad_request', message: e.message }); }
    const input = body && body.data && typeof body.data === 'object' ? body.data : {};
    const roles = Array.isArray(input.roles) ? [...new Set(input.roles.filter((role) => ROLES.has(role)))].slice(0, 2) : [];
    const primaryRole = ROLES.has(input.primaryRole) ? input.primaryRole : roles[0];
    if (!roles.length || !primaryRole || !roles.includes(primaryRole)) {
      return sendJson(res, 400, { error: 'bad_request', message: 'Choose a valid account role.' });
    }

    const displayName = cleanText(input.displayName, 80);
    if (!displayName) return sendJson(res, 400, { error: 'bad_request', message: 'Enter your full name.' });

    let children = [];
    if (roles.includes('parent')) {
      if (!Array.isArray(input.children)) {
        return sendJson(res, 400, { error: 'bad_request', message: 'Provide the children linked to this parent account.' });
      }
      children = input.children.slice(0, 10).map((child) => {
        const name = cleanText(child && child.name, 80);
        const cls = String(child && child.class || '');
        const subjects = Array.isArray(child && child.subjects)
          ? [...new Set(child.subjects.filter((subject) => typeof subject === 'string' && SUBJECTS.has(subject)))].slice(0, 20)
          : [];
        const minutes = [15, 30, 45, 60].includes(Number(child && child.minutes)) ? Number(child.minutes) : 30;
        if (!name || !BASIC_CLASS.test(cls) || !subjects.length) return null;
        return { id: cleanText(child.id, 64) || require('crypto').randomUUID(), name, class: cls, subjects, minutes };
      }).filter(Boolean);
      if (input.children.length && !children.length) return sendJson(res, 400, { error: 'bad_request', message: 'Check the child name, class and selected subjects.' });
    }

    const data = { roles, primaryRole, displayName, children };
    const updatedAt = Date.now();
    await db.query(
      'insert into account_profiles (user_id, data, updated_at) values ($1, $2::jsonb, $3) on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at',
      [me.uid, JSON.stringify(data), updatedAt]
    );
    const retainedChildIds = children.map((child) => child.id);
    await db.query('delete from parent_learning where user_id = $1 and not (data->>\'childId\' = any($2::text[]))', [me.uid, retainedChildIds]);
    return sendJson(res, 200, { ok: true, profile: { ...data, updatedAt } });
  } catch (e) {
    console.error('account profile failed:', e && e.message);
    return sendJson(res, 500, { error: 'server', message: 'Could not save your account setup. Please try again.' });
  }
};
