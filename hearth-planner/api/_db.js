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
  'create table if not exists account_profiles (user_id text primary key, data jsonb not null default \'{}\'::jsonb, updated_at bigint not null)',
  'create index if not exists plans_recent on plans (user_id, updated_at)',
  'create table if not exists response_cache (scope text not null, key text not null, params_key text not null, notes_norm text not null default \'\', response text not null, thread_len int not null default 0, tokens int not null default 0, created_at bigint not null, hits int not null default 0, primary key (scope, key))',
  'create index if not exists response_cache_lookup on response_cache (scope, params_key, created_at)',
  'create table if not exists usage (subject text not null, day text not null, tokens bigint not null default 0, requests int not null default 0, primary key (subject, day))',
  'create table if not exists quota_reservations (id text primary key, subject text not null, day text not null, tokens bigint not null, expires_at bigint not null, status text not null default \'active\')',
  'create index if not exists quota_reservations_active on quota_reservations (subject, day, expires_at) where status = \'active\'',
  'create table if not exists rate_limits (key text primary key, window_start bigint not null, hits int not null default 0)',
  // Teacher tiers: paid periods, payments (one row per Paystack reference), and plans written per week (or guest previews per day).
  'create table if not exists subscriptions (user_id text primary key, expires_at bigint not null default 0, plan text not null default \'\', updated_at bigint not null)',
  'create table if not exists payments (reference text primary key, user_id text not null, email text not null default \'\', plan text not null, amount bigint not null, currency text not null, status text not null default \'pending\', created_at bigint not null, paid_at bigint)',
  'create index if not exists payments_user on payments (user_id, created_at)',
  // Bug reports and suggestions sent from inside the app.
  "create table if not exists feedback (id text primary key, kind text not null, message text not null, email text not null default '', user_id text not null default '', tier text not null default '', context text not null default '', status text not null default 'new', created_at bigint not null)",
  'create index if not exists feedback_status on feedback (status, created_at)',
  // Approved curriculum and teaching-resource knowledge base. Source metadata is retained for citations.
  "create table if not exists knowledge_sources (id text primary key, title text not null, publisher text not null, source_url text not null, source_host text not null, document_type text not null, subject text not null default '', classes text[] not null default '{}', curriculum_codes text[] not null default '{}', trust_level text not null, license text not null default '', edition text not null default '', approval_reference text not null default '', published_at text, checksum text unique not null, status text not null default 'approved', created_by text not null default '', created_at timestamptz not null default now())",
  "create table if not exists knowledge_chunks (id text primary key, source_id text not null references knowledge_sources(id) on delete cascade, chunk_index int not null, heading text not null default '', content text not null, page_start int, page_end int, subject text not null default '', classes text[] not null default '{}', curriculum_codes text[] not null default '{}', search_vector tsvector not null)",
  'create index if not exists knowledge_chunks_search on knowledge_chunks using gin (search_vector)',
  'create index if not exists knowledge_chunks_scope on knowledge_chunks (subject, source_id)',
  'create index if not exists knowledge_sources_status on knowledge_sources (status, created_at desc)',
  'alter table knowledge_sources add column if not exists approval_reference text not null default \'\'',
  "alter table knowledge_sources alter column status set default 'pending_review'",
  // Usage numbers for the admin: daily counters, and one row per account the first time it is seen (first_seen 0 = existed before tracking began).
  'create table if not exists events (day text not null, name text not null, n int not null default 0, primary key (day, name))',
  'create table if not exists accounts (user_id text primary key, email text not null default \'\', first_seen bigint not null)',
  'alter table subscriptions add column if not exists reminded_for bigint not null default 0',
  'alter table payments add column if not exists refunded_at bigint',
  'insert into accounts (user_id, first_seen) select distinct user_id, 0 from plans on conflict do nothing',
  // Owner tools: teachers an admin has blocked, one-row settings (the announcement banner), and a record of what admins did.
  "create table if not exists blocked (user_id text primary key, email text not null default '', reason text not null default '', at bigint not null)",
  "create table if not exists settings (key text primary key, value text not null default '', updated_at bigint not null)",
  "create table if not exists admin_log (id text primary key, at bigint not null, admin text not null default '', action text not null, target text not null default '', detail text not null default '')",
  // Rewarded videos: one row per "start", marked claimed when the teacher finishes watching; bonus plans are a balance per teacher.
  "create table if not exists reward_tokens (id text primary key, user_id text not null, started_at bigint not null, claimed_at bigint, day text not null)",
  'create index if not exists reward_tokens_user on reward_tokens (user_id, day)',
  'create table if not exists bonus (user_id text primary key, n int not null default 0)',
  'create table if not exists plan_log (subject text not null, period text not null, cls text not null, n int not null default 0, primary key (subject, period, cls))',
];

// Creates the tables the first time a function runs after a deploy.
function ensure() {
  if (!ready) ready = (async () => { for (const s of SCHEMA) await query(s); })().catch((e) => { ready = null; throw e; });
  return ready;
}

const configured = () => !!(global.__PADI_SQL__ || process.env.DATABASE_URL);

module.exports = { query, ensure, configured };
