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


-- ============================================================================
-- Analytics events — usage, searches, demand signals, and each user's area.
-- One append-only row per event. Users can only INSERT rows tagged with their
-- own id (and can't read anyone's); you read/analyze via the SQL Editor.
-- ============================================================================

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete cascade,
  event      text not null,           -- 'app_open','search','search_no_results','area_set','area_uncovered','list_open','deal_view','sign_up'
  props      jsonb not null default '{}'::jsonb,  -- { query, area, results, list, ... }
  area       text,                    -- denormalized area id, for easy grouping
  platform   text,                    -- 'ios' | 'android'
  created_at timestamptz not null default now()
);

create index if not exists events_event_created_idx on public.events (event, created_at desc);
create index if not exists events_user_idx           on public.events (user_id);

alter table public.events enable row level security;

drop policy if exists "events insert own" on public.events;
create policy "events insert own"
  on public.events for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Handy queries (run in the SQL Editor whenever you want a read):
--
--   -- Daily active users (last 14 days)
--   select date(created_at) d, count(distinct user_id) users
--   from public.events where event = 'app_open'
--   group by 1 order by 1 desc;
--
--   -- Top searches
--   select props->>'query' q, count(*) n
--   from public.events where event = 'search'
--   group by 1 order by 2 desc limit 50;
--
--   -- DEMAND: items people searched but found nothing
--   select props->>'query' q, count(*) n
--   from public.events where event = 'search_no_results'
--   group by 1 order by 2 desc limit 50;
--
--   -- DEMAND: areas with no store coverage
--   select area, count(*) n
--   from public.events where event = 'area_uncovered'
--   group by 1 order by 2 desc;
--
--   -- Where your users are (latest area each user set)
--   select distinct on (user_id) user_id, area, created_at
--   from public.events where event = 'area_set'
--   order by user_id, created_at desc;
-- ---------------------------------------------------------------------------
