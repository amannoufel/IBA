-- Add pending_review status and refine RLS for assignment status updates

-- Expand allowed statuses to include pending_review
alter table public.complaint_assignments
  drop constraint if exists assignment_status_chk;

alter table public.complaint_assignments
  add constraint assignment_status_chk
  check (lower(status) in ('assigned','accepted','in_progress','pending_review','completed','rejected'));

-- Replace broad update policy with explicit role-scoped ones
drop policy if exists "Update assignment (supervisor or assignee)" on public.complaint_assignments;

-- Workers can only move their own assignment to in_progress or pending_review
create policy "Worker limited status updates"
on public.complaint_assignments
for update
to authenticated
using (worker_id = auth.uid())
with check (
  worker_id = auth.uid() and lower(status) in ('in_progress','pending_review')
);

-- Supervisors can update any assignment (used to finalize or reopen)
create policy "Supervisor can update assignments"
on public.complaint_assignments
for update
to authenticated
using (lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor')
with check (lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor');
