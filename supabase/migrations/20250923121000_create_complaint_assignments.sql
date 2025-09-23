-- Create complaint assignments table to assign complaints to workers

create table if not exists complaint_assignments (
  id bigserial primary key,
  complaint_id bigint not null references complaints(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id),
  status text not null default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (complaint_id, worker_id),
  constraint assignment_status_chk check (lower(status) in ('assigned','accepted','in_progress','completed','rejected'))
);

-- Helpful indexes
create index if not exists idx_assignments_worker on complaint_assignments(worker_id);
create index if not exists idx_assignments_complaint on complaint_assignments(complaint_id);
create index if not exists idx_assignments_status on complaint_assignments(status);

-- Update updated_at on change
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_trigger on complaint_assignments;
create trigger set_updated_at_trigger
before update on complaint_assignments
for each row execute procedure set_updated_at();

-- Enable RLS
alter table complaint_assignments enable row level security;

-- RLS policies
-- Supervisors can view all assignments (JWT based)
drop policy if exists "Supervisors can view all assignments (jwt)" on complaint_assignments;
create policy "Supervisors can view all assignments (jwt)" on complaint_assignments
  for select to authenticated
  using ( lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor' );

-- Workers can view their own assignments
drop policy if exists "Workers can view own assignments" on complaint_assignments;
create policy "Workers can view own assignments" on complaint_assignments
  for select to authenticated
  using ( worker_id = auth.uid() );

-- Tenants can view assignments for their complaints (optional)
drop policy if exists "Tenants can view assignments for own complaints" on complaint_assignments;
create policy "Tenants can view assignments for own complaints" on complaint_assignments
  for select to authenticated
  using (
    exists (
      select 1 from complaints c
      where c.id = complaint_id and c.tenant_id = auth.uid()
    )
  );

-- Only supervisors can create assignments
drop policy if exists "Supervisors can create assignments (jwt)" on complaint_assignments;
create policy "Supervisors can create assignments (jwt)" on complaint_assignments
  for insert to authenticated
  with check ( lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor' );

-- Supervisors and assigned worker can update assignment status
drop policy if exists "Update assignment (supervisor or assignee)" on complaint_assignments;
create policy "Update assignment (supervisor or assignee)" on complaint_assignments
  for update to authenticated
  using (
    worker_id = auth.uid() or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  )
  with check (
    worker_id = auth.uid() or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );

-- Supervisors can delete assignments
drop policy if exists "Supervisors can delete assignments" on complaint_assignments;
create policy "Supervisors can delete assignments" on complaint_assignments
  for delete to authenticated
  using ( lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor' );
