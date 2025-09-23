-- Allow workers to view complaints that are assigned to them

drop policy if exists "Workers can view assigned complaints" on complaints;
create policy "Workers can view assigned complaints" on complaints
  for select to authenticated
  using (
    exists (
      select 1 from complaint_assignments ca
      where ca.complaint_id = complaints.id and ca.worker_id = auth.uid()
    )
  );
