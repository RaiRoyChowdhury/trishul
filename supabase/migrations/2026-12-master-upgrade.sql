-- TRISHUL master upgrade. Run ONCE in the Supabase SQL Editor (after the earlier migrations). Safe to re-run.

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
