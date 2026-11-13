-- Run this ONCE in the Supabase SQL Editor if you already ran the old schema.sql. (Fresh installs: schema.sql already has it.)
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
