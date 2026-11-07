'use strict';
// Neon (Postgres) access over HTTP, which suits serverless functions. Set DATABASE_URL to the Neon connection string.
let client = null;
let ready = null;

function query(text, params) {
  if (global.__PADI_SQL__) return global.__PADI_SQL__.query(text, params || []);   // tests only
  if (!client) {
    const { neon } = require('@neondatabase/serverless');
    client = neon(process.env.DATABASE_URL);
  }
  return client.query(text, params || []);
}

const SCHEMA = [
  'create table if not exists users (id text primary key, email text unique not null, created_at timestamptz not null default now())',
  'create table if not exists otp_codes (email text primary key, code_hash text not null, expires_at bigint not null, attempts int not null default 0, sent_at bigint not null, sent_count int not null default 1, window_start bigint not null)',
  "create table if not exists plans (user_id text not null, id text not null, data jsonb not null default '{}'::jsonb, updated_at bigint not null, deleted boolean not null default false, primary key (user_id, id))",
  "create table if not exists profiles (user_id text primary key, data jsonb not null default '{}'::jsonb, updated_at bigint not null)",
  'create index if not exists plans_recent on plans (user_id, updated_at)',
  'create table if not exists response_cache (scope text not null, key text not null, params_key text not null, notes_norm text not null default \'\', response text not null, thread_len int not null default 0, tokens int not null default 0, created_at bigint not null, hits int not null default 0, primary key (scope, key))',
  'create index if not exists response_cache_lookup on response_cache (scope, params_key, created_at)',
  'create table if not exists usage (subject text not null, day text not null, tokens bigint not null default 0, requests int not null default 0, primary key (subject, day))',
  // Teacher tiers: paid periods, payments (one row per Paystack reference), and plans written per week (or guest previews per day).
  'create table if not exists subscriptions (user_id text primary key, expires_at bigint not null default 0, plan text not null default \'\', updated_at bigint not null)',
  'create table if not exists payments (reference text primary key, user_id text not null, email text not null default \'\', plan text not null, amount bigint not null, currency text not null, status text not null default \'pending\', created_at bigint not null, paid_at bigint)',
  'create index if not exists payments_user on payments (user_id, created_at)',
  // Bug reports and suggestions sent from inside the app.
  "create table if not exists feedback (id text primary key, kind text not null, message text not null, email text not null default '', user_id text not null default '', tier text not null default '', context text not null default '', status text not null default 'new', created_at bigint not null)",
  'create index if not exists feedback_status on feedback (status, created_at)',
  'create table if not exists plan_log (subject text not null, period text not null, cls text not null, n int not null default 0, primary key (subject, period, cls))',
];

// Creates the tables the first time a function runs after a deploy.
function ensure() {
  if (!ready) ready = (async () => { for (const s of SCHEMA) await query(s); })().catch((e) => { ready = null; throw e; });
  return ready;
}

const configured = () => !!(global.__PADI_SQL__ || process.env.DATABASE_URL);

module.exports = { query, ensure, configured };
