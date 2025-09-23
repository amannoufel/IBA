-- Fix complaints RLS 400 by removing recursive subquery on profiles in policies
-- Introduce a SECURITY DEFINER helper that checks role without referencing
-- RLS-enabled tables directly in policy expressions.

-- Create helper function to check if a given user is a supervisor
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

-- Ensure RLS is enabled on complaints
alter table if exists public.complaints enable row level security;

-- Drop any prior supervisor policies that may reference profiles directly or JWT-only variants
drop policy if exists "Supervisors can view all complaints" on public.complaints;
drop policy if exists "Supervisors can view all complaints (jwt)" on public.complaints;
drop policy if exists "Supervisors can view all complaints (profiles)" on public.complaints;
drop policy if exists "Supervisors can update complaints" on public.complaints;
drop policy if exists "Supervisors can update complaints (jwt)" on public.complaints;
drop policy if exists "Supervisors can update complaints (profiles)" on public.complaints;

-- Recreate supervisor policies using the helper (no recursion) and still accept JWT role when present
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

-- Note: profiles RLS remains intact. The helper runs as definer and avoids policy recursion.
