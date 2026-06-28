-- Trip GPS Supabase schema.
--
-- Run this file in the Supabase SQL editor for the project configured by
-- TRIP_GPS_SUPABASE_URL. Do not create public RLS policies for these tables:
-- all access goes through the Next.js server-only service-role client.

begin;

create table if not exists public.trip_share_sessions (
  id text primary key,
  trip_id text not null,
  active boolean not null default true,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  stopped_at timestamptz,
  owner_token_hash text not null check (owner_token_hash ~ '^[0-9a-f]{64}$'),
  viewer_token_hash text not null check (viewer_token_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists trip_share_sessions_owner_token_hash_idx
  on public.trip_share_sessions (owner_token_hash);

create unique index if not exists trip_share_sessions_viewer_token_hash_idx
  on public.trip_share_sessions (viewer_token_hash);

create index if not exists trip_share_sessions_active_expires_at_idx
  on public.trip_share_sessions (active, expires_at);

create table if not exists public.trip_location_latest (
  session_id text primary key
    references public.trip_share_sessions (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision not null check (accuracy_m >= 0),
  speed_mps double precision,
  heading_deg double precision check (heading_deg is null or heading_deg between 0 and 360),
  mode text not null check (mode in ('active', 'saver', 'rest')),
  reason text not null check (reason in ('scheduled', 'manual', 'start', 'stop', 'retry')),
  client_ts timestamptz not null,
  server_ts timestamptz not null default now()
);

create index if not exists trip_location_latest_server_ts_idx
  on public.trip_location_latest (server_ts);

create table if not exists public.trip_location_points (
  session_id text not null
    references public.trip_share_sessions (id) on delete cascade,
  seq integer not null check (seq >= 0),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision not null check (accuracy_m >= 0),
  speed_mps double precision,
  heading_deg double precision check (heading_deg is null or heading_deg between 0 and 360),
  mode text not null check (mode in ('active', 'saver', 'rest')),
  reason text not null check (reason in ('scheduled', 'manual', 'start', 'stop', 'retry')),
  client_ts timestamptz not null,
  server_ts timestamptz not null default now(),
  primary key (session_id, seq)
);

create index if not exists trip_location_points_server_ts_idx
  on public.trip_location_points (server_ts);

create index if not exists trip_location_points_session_server_ts_idx
  on public.trip_location_points (session_id, server_ts desc);

alter table public.trip_share_sessions enable row level security;
alter table public.trip_location_latest enable row level security;
alter table public.trip_location_points enable row level security;

create or replace function public.trip_gps_clear_latest_on_session_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active is false or new.revoked_at is not null or new.stopped_at is not null then
    delete from public.trip_location_latest where session_id = new.id;
  end if;

  return new;
end;
$$;

revoke execute on function public.trip_gps_clear_latest_on_session_end()
  from public, anon, authenticated;

drop trigger if exists trip_gps_clear_latest_after_session_end
  on public.trip_share_sessions;

create trigger trip_gps_clear_latest_after_session_end
after update of active, revoked_at, stopped_at
on public.trip_share_sessions
for each row
when (
  new.active is false
  or new.revoked_at is not null
  or new.stopped_at is not null
)
execute function public.trip_gps_clear_latest_on_session_end();

create or replace function public.trip_gps_retention_cleanup(
  point_retention interval default interval '72 hours'
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.trip_location_points
  where server_ts < now() - point_retention;

  delete from public.trip_location_latest latest
  using public.trip_share_sessions session
  where latest.session_id = session.id
    and (
      session.active is false
      or session.revoked_at is not null
      or session.stopped_at is not null
      or session.expires_at <= now()
    );
$$;

revoke execute on function public.trip_gps_retention_cleanup(interval)
  from public, anon, authenticated;
grant execute on function public.trip_gps_retention_cleanup(interval)
  to service_role;

-- Run manually or schedule with Supabase cron. Keep point_retention between
-- 24 and 72 hours for the MVP, for example:
-- select public.trip_gps_retention_cleanup(interval '72 hours');

commit;
