-- Padi-T tables for Neon (Postgres). The API creates these automatically on first use,
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
