-- Definitive cleanup of all complaints supervisor policies and ensure fresh ones
-- This will fix the persistent 400 error by removing any conflicting policies

-- Drop ALL supervisor policies that might exist from various migrations
drop policy if exists "Supervisors can view all complaints" on public.complaints;
drop policy if exists "Supervisors can view all complaints (jwt)" on public.complaints;
drop policy if exists "Supervisors can view all complaints (profiles)" on public.complaints;
drop policy if exists "Supervisors can update complaints" on public.complaints;
drop policy if exists "Supervisors can update complaints (jwt)" on public.complaints;
drop policy if exists "Supervisors can update complaints (profiles)" on public.complaints;

-- Ensure RLS is enabled
alter table if exists public.complaints enable row level security;

-- Create or replace helper function (safer version with explicit schema)
create or replace function public.is_supervisor(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and lower(p.role) = 'supervisor'
  );
$$;

-- Grant execute to authenticated users
grant execute on function public.is_supervisor(uuid) to authenticated;

-- Create clean supervisor policies
create policy "Supervisors can view all complaints" on public.complaints
  for select to authenticated
  using (
    public.is_supervisor(auth.uid())
    or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );

create policy "Supervisors can update complaints" on public.complaints
  for update to authenticated
  using (
    public.is_supervisor(auth.uid())
    or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  )
  with check (
    public.is_supervisor(auth.uid())
    or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );

-- Also ensure profiles can be read by supervisors for the helper function
drop policy if exists "Supervisors can view all profiles" on public.profiles;
drop policy if exists "Supervisors can view all profiles (jwt)" on public.profiles;

create policy "Supervisors can view all profiles" on public.profiles
  for select to authenticated
  using (
    lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
    or auth.uid() = id  -- users can view their own profile
  );