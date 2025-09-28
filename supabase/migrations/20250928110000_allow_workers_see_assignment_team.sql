-- Allow workers to see all assignments for the same complaint they are assigned to
-- This enables showing the full team in the worker dashboard Job Details

begin;

-- Ensure RLS is enabled on complaint_assignments (should already be enabled in schema)
-- alter table public.complaint_assignments enable row level security; -- no-op if already enabled

create policy workers_select_same_complaint_assignments
  on public.complaint_assignments
  for select
  using (
    exists (
      select 1
      from public.complaint_assignments ca2
      where ca2.complaint_id = complaint_assignments.complaint_id
        and ca2.worker_id = auth.uid()
    )
  );

commit;
