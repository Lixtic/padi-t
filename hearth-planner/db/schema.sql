-- GuidEd tables for Neon (Postgres). The API creates these automatically on first use,
-- so running this file is optional. Keep it for reference or to create the tables yourself in the Neon SQL Editor.

create table if not exists users (
  id         text primary key,
  email      text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists otp_codes (
  email        text primary key,
  code_hash    text   not null,
  expires_at   bigint not null,
  attempts     int    not null default 0,
  sent_at      bigint not null,
  sent_count   int    not null default 1,
  window_start bigint not null
);

create table if not exists plans (
  user_id    text    not null,
  id         text    not null,
  data       jsonb   not null default '{}'::jsonb,
  updated_at bigint  not null,
  deleted    boolean not null default false,
  primary key (user_id, id)
);

create table if not exists profiles (
  user_id    text   primary key,
  data       jsonb  not null default '{}'::jsonb,
  updated_at bigint not null
);

create index if not exists plans_recent on plans (user_id, updated_at);

-- Cached plan answers. A repeat of a recent request is served from here at no token cost.
create table if not exists response_cache (
  scope      text   not null,                 -- 'global' (no teacher's notes) or 'p:<hashed user or address>'
  key        text   not null,
  params_key text   not null,
  notes_norm text   not null default '',
  response   text   not null,
  thread_len int    not null default 0,
  tokens     int    not null default 0,
  created_at bigint not null,
  hits       int    not null default 0,
  primary key (scope, key)
);
create index if not exists response_cache_lookup on response_cache (scope, params_key, created_at);

-- Estimated tokens used per teacher (or hashed network address) per UTC day. The row with subject 'global' is the site total.
create table if not exists usage (
  subject  text   not null,
  day      text   not null,
  tokens   bigint not null default 0,
  requests int    not null default 0,
  primary key (subject, day)
);

-- Teacher tiers (guest / free / pro). Created automatically on first use; listed here for reference.
create table if not exists subscriptions (user_id text primary key, expires_at bigint not null default 0, plan text not null default '', updated_at bigint not null);
create table if not exists payments (reference text primary key, user_id text not null, email text not null default '', plan text not null, amount bigint not null, currency text not null, status text not null default 'pending', created_at bigint not null, paid_at bigint);
create index if not exists payments_user on payments (user_id, created_at);
create table if not exists plan_log (subject text not null, period text not null, cls text not null, n int not null default 0, primary key (subject, period, cls));
