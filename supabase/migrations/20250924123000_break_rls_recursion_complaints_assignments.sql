-- Break RLS recursion between complaints and complaint_assignments
-- Root cause: complaints SELECT policy referenced complaint_assignments, whose SELECT policy referenced complaints
-- Fix: use SECURITY DEFINER helper for worker visibility and drop recursive tenant policy on assignments

-- 1) Helper function: is_worker_assigned_to_complaint
create or replace function public.is_worker_assigned_to_complaint(uid uuid, cid bigint)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.complaint_assignments ca
    where ca.worker_id = uid and ca.complaint_id = cid
  );
$$;

-- 2) Replace worker complaints policy to use helper (no cross-table reference)
drop policy if exists "Workers can view assigned complaints" on public.complaints;
create policy "Workers can view assigned complaints" on public.complaints
  for select to authenticated
  using (
    public.is_worker_assigned_to_complaint(auth.uid(), id)
  );

-- 3) Remove recursive tenant policy on complaint_assignments (not required by app)
drop policy if exists "Tenants can view assignments for own complaints" on public.complaint_assignments;

-- Optional: if tenant view is required in future, reintroduce with a SECURITY DEFINER helper to avoid recursion
-- Example:
-- create or replace function public.is_tenant_of_complaint(uid uuid, cid bigint)
-- returns boolean language sql stable security definer set search_path = public, auth as $$
--   select exists (select 1 from public.complaints c where c.id = cid and c.tenant_id = uid);
-- $$;
-- create policy "Tenants can view assignments for own complaints" on public.complaint_assignments
--   for select to authenticated using ( public.is_tenant_of_complaint(auth.uid(), complaint_id) );
