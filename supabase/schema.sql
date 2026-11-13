-- TRISHUL database schema for Supabase (PostgreSQL).
-- HOW TO USE: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run once on a fresh project. Every table has Row Level Security (RLS) switched on:
-- that means the DATABASE itself refuses to show a user anything that is not theirs,
-- even if a bug in our server code forgot to check.

create extension if not exists pgcrypto;

-- ---------- Profiles -------------------------------------------------------
-- We store an age GROUP (teen / adult) instead of a birth date: data minimisation.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  age_group text not null check (age_group in ('teen','adult')),
  guardian_consent boolean not null default false,   -- teens: needs real-world guardian/institution check
  language text not null default 'bn' check (language in ('bn','hi','en')),
  verification_status text not null default 'test_account'
    check (verification_status in ('test_account','unverified','verified')),
  age int, profession text, organisation text, gender_declared boolean not null default false,
  photo_status text not null default 'none', id_method text,
  created_at timestamptz not null default now()
);

-- Walk Together profile fields + protection (see supabase/migrations/2026-11-walk-profiles.sql)
alter table public.profiles add column if not exists age int;
alter table public.profiles add column if not exists profession text;
alter table public.profiles add column if not exists organisation text;
alter table public.profiles add column if not exists gender_declared boolean not null default false;
alter table public.profiles add column if not exists photo_status text not null default 'none';
alter table public.profiles add column if not exists id_method text;
do $$ begin
  alter table public.profiles add constraint profiles_age_range check (age is null or age between 13 and 100);
  alter table public.profiles add constraint profiles_age_vs_group check (age is null or ((age < 18) = (age_group = 'teen')));
  alter table public.profiles add constraint profiles_profession check (profession is null or profession in ('student','working','homemaker','self_employed','other'));
  alter table public.profiles add constraint profiles_org_len check (organisation is null or char_length(organisation) <= 80);
  alter table public.profiles add constraint profiles_photo_status check (photo_status in ('none','pending','approved','rejected'));
  alter table public.profiles add constraint profiles_id_method check (id_method is null or id_method in ('digilocker','aadhaar_ekyc'));
exception when duplicate_object then null; end $$;

create or replace function public.protect_profile_columns() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' and (
       new.age_group is distinct from old.age_group or
       new.guardian_consent is distinct from old.guardian_consent or
       new.verification_status is distinct from old.verification_status or
       new.photo_status is distinct from old.photo_status or
       new.id_method is distinct from old.id_method) then
    raise exception 'age_group, guardian_consent, verification_status, photo_status and id_method can only be changed by the server or an administrator';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------- Settings (one row per user) -----------------------------------
-- Phrases are stored only as salted SHA-256 hashes. The readable phrase stays on the user's device
-- (needed for matching speech). See docs/HANDBOOK.md "Why hashes?"
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  location_consent boolean not null default false,
  voice_engine text not null default 'cloud' check (voice_engine in ('cloud','device')),
  sos_enabled boolean not null default true,
  sos_phrase_hash text, sos_phrase_salt text, sos_phrase_lang text check (sos_phrase_lang in ('bn','hi','en')),
  sos_countdown_seconds int not null default 10 check (sos_countdown_seconds between 5 and 30),
  nt_enabled boolean not null default false,
  nt_phrase_hash text, nt_phrase_salt text, nt_phrase_lang text check (nt_phrase_lang in ('bn','hi','en')),
  nt_voice_enabled boolean not null default true,
  nt_shake_enabled boolean not null default true,
  nt_shake_sensitivity int not null default 3 check (nt_shake_sensitivity between 1 and 5),
  nt_countdown_seconds int not null default 10 check (nt_countdown_seconds between 5 and 30),
  nt_cooldown_seconds int not null default 120 check (nt_cooldown_seconds between 30 and 900),
  accessibility jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Create profile + settings automatically when someone signs up.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare ag text := coalesce(new.raw_user_meta_data->>'age_group','adult');
        lang text := coalesce(new.raw_user_meta_data->>'language','bn');
begin
  if ag not in ('teen','adult') then ag := 'adult'; end if;
  if lang not in ('bn','hi','en') then lang := 'bn'; end if;
  insert into public.profiles(id, display_name, age_group, language)
    values (new.id, left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)), 60), ag, lang);
  insert into public.user_settings(user_id) values (new.id);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Caller profiles (AI Fake Call) --------------------------------
create table if not exists public.caller_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  relationship text not null check (char_length(relationship) between 1 and 40),
  language text not null default 'bn' check (language in ('bn','hi','en')),
  voice_source text not null default 'standard' check (voice_source in ('standard','consented_sample')),
  voice_id text check (char_length(voice_id) <= 64),
  voice_consent_confirmed boolean not null default false,
  speaking_style text check (char_length(speaking_style) <= 200),
  created_at timestamptz not null default now(),
  -- A personalised voice may only exist if the voice owner's consent was confirmed.
  check (voice_source = 'standard' or voice_consent_confirmed)
);

-- ---------- Trusted contacts ----------------------------------------------
create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  relationship text check (char_length(relationship) <= 40),
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  telegram_chat_id text check (telegram_chat_id ~ '^-?[0-9]{5,20}$'),
  consent_confirmed boolean not null default false,   -- the contact agreed to receive alerts
  created_at timestamptz not null default now(),
  check (phone is not null or telegram_chat_id is not null)
);

-- ---------- Community safety reports --------------------------------------
create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,   -- never shown to other users
  category text not null check (category in ('harassment','poor_lighting','isolated_area','unsafe_transport','suspicious_activity','road_hazard','improved_lighting','positive')),
  description text check (char_length(description) <= 500),
  lat numeric(8,5) not null check (lat between -90 and 90),    -- rounded server-side (about 1 km) -> approximate only
  lng numeric(8,5) not null check (lng between -180 and 180),
  area_label text check (char_length(area_label) <= 80),
  occurred_at timestamptz not null default now(),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified')),
  corroboration_count int not null default 0,
  flag_count int not null default 0,
  status text not null default 'active' check (status in ('active','hidden')),
  created_at timestamptz not null default now()
);
create index if not exists idx_reports_geo on public.safety_reports (lat, lng);
create table if not exists public.report_feedback (
  report_id uuid not null references public.safety_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('inaccurate','outdated','confirm')),
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

-- ---------- Safe Havens ----------------------------------------------------
-- Intentionally EMPTY. Only add a place after a real person has visited and agreed.
create table if not exists public.safe_havens (
  id uuid primary key default gen_random_uuid(),
  name text not null, kind text not null check (kind in ('shop','pharmacy','hospital','police','other')),
  address text, lat numeric(8,5) not null, lng numeric(8,5) not null,
  verification_status text not null default 'unverified' check (verification_status in ('sample','unverified','verified')),
  verified_by text, verified_at timestamptz, created_at timestamptz not null default now(),
  check (verification_status <> 'verified' or (verified_by is not null and verified_at is not null))
);

-- ---------- Walk Together --------------------------------------------------
-- No coordinates are stored for journeys: only place NAMES, to protect teen privacy.
create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('teen','adult')),   -- copied from owner's age group
  origin_label text not null check (char_length(origin_label) between 2 and 80),
  destination_label text not null check (char_length(destination_label) between 2 and 80),
  depart_at timestamptz not null,
  meeting_point_label text not null check (char_length(meeting_point_label) between 2 and 100),
  max_companions int not null default 2 check (max_companions between 1 and 3),
  status text not null default 'open' check (status in ('open','cancelled','ended')),
  created_at timestamptz not null default now(), ended_at timestamptz
);
create table if not exists public.journey_requests (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  message text check (char_length(message) <= 200),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(), unique (journey_id, requester_id)
);
create table if not exists public.journey_participants (
  journey_id uuid not null references public.journeys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','companion')),
  joined_at timestamptz not null default now(), left_at timestamptz,
  primary key (journey_id, user_id)
);
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id)
);
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  journey_id uuid references public.journeys(id) on delete set null,
  reason text not null check (reason in ('harassment','unsafe_behaviour','fake_profile','other')),
  details text check (char_length(details) <= 500),
  status text not null default 'open', created_at timestamptz not null default now()
);

-- ---------- SOS events and notification attempts ---------------------------
create table if not exists public.sos_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_event_id uuid not null,                       -- makes retries safe (no duplicate alerts)
  source text not null check (source in ('secret_code','no_touch_voice','no_touch_shake','manual')),
  mode text not null check (mode in ('live','test')),
  status text not null default 'active' check (status in ('active','cancelled','resolved')),
  location_consented boolean not null default false,
  lat numeric(9,6), lng numeric(9,6), accuracy_m numeric(8,1),
  triggered_at timestamptz not null default now(), cancelled_at timestamptz,
  unique (user_id, client_event_id)
);
create table if not exists public.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  sos_event_id uuid not null references public.sos_events(id) on delete cascade,
  contact_id uuid references public.trusted_contacts(id) on delete set null,
  contact_name text not null, channel text not null check (channel in ('telegram','sms')),
  status text not null check (status in ('pending','sent','failed','unavailable')),
  provider_message_id text, error_message text,
  created_at timestamptz not null default now()
);

-- Latest live position of each person in a walk. Only the server (service role) reads or writes it: no RLS policies on purpose.
create table if not exists public.walk_locations (
  journey_id uuid not null references public.journeys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null, lng double precision not null,
  updated_at timestamptz not null default now(),
  primary key (journey_id, user_id)
);
alter table public.walk_locations enable row level security;

-- Private bucket for profile photos. No policies: only the server (service role) uploads and serves them.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false) on conflict (id) do nothing;


-- ---------- Row Level Security --------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.caller_profiles enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.safety_reports enable row level security;
alter table public.report_feedback enable row level security;
alter table public.safe_havens enable row level security;
alter table public.journeys enable row level security;
alter table public.journey_requests enable row level security;
alter table public.journey_participants enable row level security;
alter table public.blocks enable row level security;
alter table public.user_reports enable row level security;
alter table public.sos_events enable row level security;
alter table public.notification_attempts enable row level security;

-- "Own rows only" tables
create policy "own profile read" on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "own settings all" on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own callers all" on public.caller_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own contacts all" on public.trusted_contacts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own reports read" on public.safety_reports for select using (user_id = auth.uid());
create policy "own reports insert" on public.safety_reports for insert with check (user_id = auth.uid());
create policy "own reports delete" on public.safety_reports for delete using (user_id = auth.uid());
create policy "own feedback all" on public.report_feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own blocks all" on public.blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "own user_reports insert" on public.user_reports for insert with check (reporter_id = auth.uid());
create policy "own user_reports read" on public.user_reports for select using (reporter_id = auth.uid());
create policy "own sos read" on public.sos_events for select using (user_id = auth.uid());
create policy "own sos insert" on public.sos_events for insert with check (user_id = auth.uid());
create policy "own sos update" on public.sos_events for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own attempts read" on public.notification_attempts for select
  using (exists (select 1 from public.sos_events e where e.id = sos_event_id and e.user_id = auth.uid()));
-- (notification_attempts are WRITTEN only by our server with the service key: users cannot forge "sent".)

-- Safe havens: everyone signed in may read; nobody may write from the app.
create policy "havens read" on public.safe_havens for select to authenticated using (true);

-- Walk Together: same age group only, never through a block, participants only see their own journeys' people.
create policy "journeys visible same age group" on public.journeys for select to authenticated using (
  owner_id = auth.uid() or (
    status = 'open' and audience = (select age_group from public.profiles where id = auth.uid())
    and not exists (select 1 from public.blocks b where (b.blocker_id = owner_id and b.blocked_id = auth.uid()) or (b.blocker_id = auth.uid() and b.blocked_id = owner_id))));
create policy "journey requests visible to parties" on public.journey_requests for select to authenticated using (
  requester_id = auth.uid() or exists (select 1 from public.journeys j where j.id = journey_id and j.owner_id = auth.uid()));
create policy "participants visible to members" on public.journey_participants for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.journey_participants me where me.journey_id = journey_id and me.user_id = auth.uid()));
-- Journey writes go through the server (it enforces the teen rules), using the service key.

-- ---------- Optional: approve a TEST teen account (run by YOU, the administrator) ----
-- update public.profiles set guardian_consent = true where display_name = 'Test Teen';

-- ====== TRISHUL master upgrade (same as supabase/migrations/2026-12-master-upgrade.sql) ======
-- ===== Roles and privacy =====
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists privacy_name text not null default 'first';
alter table public.profiles add column if not exists privacy_photo boolean not null default true;
alter table public.profiles add column if not exists privacy_age boolean not null default true;
do $$ begin
  alter table public.profiles add constraint profiles_role check (role in ('user','admin'));
  alter table public.profiles add constraint profiles_privacy_name check (privacy_name in ('first','initial'));
exception when duplicate_object then null; end $$;

create or replace function public.protect_profile_columns() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' and (
       new.age_group is distinct from old.age_group or new.guardian_consent is distinct from old.guardian_consent or
       new.verification_status is distinct from old.verification_status or new.photo_status is distinct from old.photo_status or
       new.id_method is distinct from old.id_method or new.role is distinct from old.role) then
    raise exception 'age_group, guardian_consent, verification_status, photo_status, id_method and role can only be changed by the server or an administrator';
  end if;
  return new;
end $$;

-- ===== AI budget (ONE shared lifetime budget, in paise: 2000 paise = Rs 20) =====
create table if not exists public.ai_config (
  id int primary key default 1 check (id = 1),
  budget_paise int not null default 2000 check (budget_paise >= 0),
  spent_paise int not null default 0 check (spent_paise >= 0),
  reserved_paise int not null default 0 check (reserved_paise >= 0),
  live_enabled boolean not null default false,
  activated_at timestamptz, expires_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.ai_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), settled_at timestamptz,
  user_id uuid, provider text not null, model text not null, operation text not null,
  status text not null default 'reserved' check (status in ('reserved','committed','refunded','failed')),
  estimated_paise int not null, actual_paise int, units jsonb, note text
);
create index if not exists idx_ledger_created on public.ai_usage_ledger (created_at desc);

-- Atomic reservation: one UPDATE decides, so simultaneous requests can never overspend the budget.
create or replace function public.reserve_ai_budget(p_amount int, p_user uuid, p_provider text, p_model text, p_operation text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rows int;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'AI_BAD_ESTIMATE'; end if;
  update public.ai_config set reserved_paise = reserved_paise + p_amount, updated_at = now()
   where id = 1 and live_enabled and activated_at is not null and expires_at is not null
     and now() >= activated_at and now() < expires_at
     and spent_paise + reserved_paise + p_amount <= budget_paise;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'AI_UNAVAILABLE'; end if;
  insert into public.ai_usage_ledger (user_id, provider, model, operation, estimated_paise) values (p_user, p_provider, p_model, p_operation, p_amount) returning id into v_id;
  return v_id;
end $$;

-- Settle: release the reservation and record what was really used (or 0 when the provider call failed).
create or replace function public.settle_ai_usage(p_id uuid, p_actual int, p_status text, p_units jsonb, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_est int;
begin
  select estimated_paise into v_est from public.ai_usage_ledger where id = p_id and status = 'reserved' for update;
  if not found then return; end if;
  update public.ai_usage_ledger set status = p_status, actual_paise = greatest(p_actual, 0), units = p_units, note = p_note, settled_at = now() where id = p_id;
  update public.ai_config set reserved_paise = greatest(reserved_paise - v_est, 0), spent_paise = spent_paise + (case when p_status = 'committed' then greatest(p_actual, 0) else 0 end), updated_at = now() where id = 1;
end $$;
revoke all on function public.reserve_ai_budget(int, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.settle_ai_usage(uuid, int, text, jsonb, text) from public, anon, authenticated;
alter table public.ai_config enable row level security;
alter table public.ai_usage_ledger enable row level security;   -- no policies: server only

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(), admin_id uuid not null, action text not null, detail jsonb, created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;

-- ===== TrustPass (one-time in-person QR verification) =====
create table if not exists public.trustpass_challenges (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  request_id uuid not null references public.journey_requests(id) on delete cascade,
  issuer_id uuid not null references auth.users(id) on delete cascade,
  scanner_id uuid not null references auth.users(id) on delete cascade,
  nonce_hash text not null,                       -- only a hash is stored; the nonce lives in the QR
  expires_at timestamptz not null, scanned_at timestamptz, verified_at timestamptz,
  issuer_confirmed boolean not null default false, scanner_confirmed boolean not null default false,
  status text not null default 'issued' check (status in ('issued','scanned','verified','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists idx_trustpass_journey on public.trustpass_challenges (journey_id);
alter table public.trustpass_challenges enable row level security;   -- no policies: server only

-- ===== Shakti Network =====
create table if not exists public.shakti_volunteers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 60),
  area text not null check (char_length(area) between 1 and 60),
  verification_status text not null default 'unverified' check (verification_status in ('demo','unverified','pending','verified')),
  training_status text not null default 'none' check (training_status in ('none','in_progress','completed')),
  safeguarding_status text not null default 'none' check (safeguarding_status in ('none','pending','cleared')),
  available boolean not null default false, is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.shakti_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  volunteer_id uuid not null references public.shakti_volunteers(id) on delete cascade,
  message text check (char_length(message) <= 300),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now()
);
alter table public.shakti_volunteers enable row level security;
alter table public.shakti_requests enable row level security;        -- no policies: server only

-- ===== Evidence Vault (own records only) =====
create table if not exists public.evidence_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text check (char_length(description) <= 2000),
  incident_at timestamptz not null default now(),
  retention_days int not null default 90 check (retention_days between 1 and 3650),
  created_at timestamptz not null default now()
);
create table if not exists public.evidence_audit (
  id uuid primary key default gen_random_uuid(), evidence_id uuid, user_id uuid not null, action text not null, created_at timestamptz not null default now()
);
alter table public.evidence_records enable row level security;
alter table public.evidence_audit enable row level security;
do $$ begin
  create policy "own evidence all" on public.evidence_records for all using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;
