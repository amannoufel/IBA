-- Add leader capability to complaint assignments
alter table public.complaint_assignments
  add column if not exists is_leader boolean not null default false;

-- Ensure at most one leader per complaint
create unique index if not exists one_leader_per_complaint
  on public.complaint_assignments(complaint_id)
  where is_leader;

-- (Optional) Backfill: no automatic leader selection; supervisors must set one

-- Update RLS: restrict assignment_details and assignment_materials write ops to leader assignments only.
-- Drop existing write policies and recreate with is_leader predicate.

-- assignment_details insert/update
drop policy if exists "Upsert assignment details (worker only)" on public.assignment_details;
drop policy if exists "Update assignment details (worker only)" on public.assignment_details;

create policy "Upsert assignment details (leader only)" on public.assignment_details
  for insert to authenticated
  with check (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id
        and ca.worker_id = auth.uid()
        and ca.is_leader
    )
  );

create policy "Update assignment details (leader only)" on public.assignment_details
  for update to authenticated
  using (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id
        and ca.worker_id = auth.uid()
        and ca.is_leader
    )
  )
  with check (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id
        and ca.worker_id = auth.uid()
        and ca.is_leader
    )
  );

-- assignment_materials insert/delete limited to leader
drop policy if exists "Insert assignment materials (worker only)" on public.assignment_materials;
drop policy if exists "Delete assignment materials (worker only)" on public.assignment_materials;

create policy "Insert assignment materials (leader only)" on public.assignment_materials
  for insert to authenticated
  with check (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id
        and ca.worker_id = auth.uid()
        and ca.is_leader
    )
  );

create policy "Delete assignment materials (leader only)" on public.assignment_materials
  for delete to authenticated
  using (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id
        and ca.worker_id = auth.uid()
        and ca.is_leader
    )
  );
