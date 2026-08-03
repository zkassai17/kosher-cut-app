-- koshercart cloud sync — run this ONCE in the Supabase SQL Editor.
-- (Dashboard → SQL Editor → New query → paste all of this → Run.)
--
-- Creates one row per user holding their lists + regulars, locked down so each
-- user can only read/write their OWN row (Row Level Security).

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  lists      jsonb not null default '[]'::jsonb,
  regulars   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

-- A user can only see and change their own row.
drop policy if exists "user_data owner read"   on public.user_data;
drop policy if exists "user_data owner insert" on public.user_data;
drop policy if exists "user_data owner update" on public.user_data;

create policy "user_data owner read"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "user_data owner insert"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "user_data owner update"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
