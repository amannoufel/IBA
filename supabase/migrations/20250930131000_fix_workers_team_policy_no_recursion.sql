-- Fix recursive RLS on complaint_assignments by using a SECURITY DEFINER helper
-- This avoids "infinite recursion detected in policy" errors when a policy
-- subqueries the same table.

begin;

-- Helper to check if current user is assigned to the complaint, bypassing RLS
create or replace function public.is_user_assigned_to_complaint(cid bigint)
returns boolean
language sql
stable
security definer
set search_path = public as $$
  select exists (
    select 1 from public.complaint_assignments ca
    where ca.complaint_id = cid
      and ca.worker_id = auth.uid()
  );
$$;

grant execute on function public.is_user_assigned_to_complaint(bigint) to authenticated;

-- Recreate the policy without self-referencing subquery
drop policy if exists workers_select_same_complaint_assignments on public.complaint_assignments;
create policy workers_select_same_complaint_assignments
  on public.complaint_assignments
  for select
  to authenticated
  using (
    -- Always allow user to see their own row
    complaint_assignments.worker_id = auth.uid()
    -- Also allow seeing any rows for complaints the user is assigned to
    or public.is_user_assigned_to_complaint(complaint_assignments.complaint_id)
  );

commit;
