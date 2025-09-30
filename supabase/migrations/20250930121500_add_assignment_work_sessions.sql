-- Per-worker work sessions per assignment
create table if not exists public.assignment_work_sessions (
  id bigserial primary key,
  assignment_id bigint not null references public.complaint_assignments(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  start_at timestamptz not null default now(),
  end_at timestamptz null,
  visit_id bigint null references public.assignment_visits(id) on delete set null,
  note text null,
  created_at timestamptz not null default now()
);

-- Prevent overlapping open sessions for the same worker across assignments
create unique index if not exists uniq_open_session_per_worker
  on public.assignment_work_sessions(worker_id)
  where end_at is null;

alter table public.assignment_work_sessions enable row level security;

-- Read: workers see own; leaders on same complaint can see; (optionally) supervisors can see via JWT role
drop policy if exists "sessions_read" on public.assignment_work_sessions;
create policy "sessions_read" on public.assignment_work_sessions
for select to authenticated
using (
  worker_id = auth.uid()
  or exists (
    select 1
    from public.complaint_assignments ca_leader
    join public.complaint_assignments ca_target
      on ca_target.id = assignment_work_sessions.assignment_id
     and ca_target.complaint_id = ca_leader.complaint_id
    where ca_leader.worker_id = auth.uid()
      and ca_leader.is_leader = true
  )
  or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
);

-- Insert: worker can insert own; leader on same complaint can insert for team
drop policy if exists "sessions_insert" on public.assignment_work_sessions;
create policy "sessions_insert" on public.assignment_work_sessions
for insert to authenticated
with check (
  worker_id = auth.uid()
  or exists (
    select 1
    from public.complaint_assignments ca_leader
    join public.complaint_assignments ca_target
      on ca_target.id = assignment_work_sessions.assignment_id
     and ca_target.complaint_id = ca_leader.complaint_id
    where ca_leader.worker_id = auth.uid()
      and ca_leader.is_leader = true
  )
);

-- Update: worker can update own open; leader on same complaint can update any
drop policy if exists "sessions_update" on public.assignment_work_sessions;
create policy "sessions_update" on public.assignment_work_sessions
for update to authenticated
using (
  (worker_id = auth.uid() and end_at is null)
  or exists (
    select 1
    from public.complaint_assignments ca_leader
    join public.complaint_assignments ca_target
      on ca_target.id = assignment_work_sessions.assignment_id
     and ca_target.complaint_id = ca_leader.complaint_id
    where ca_leader.worker_id = auth.uid()
      and ca_leader.is_leader = true
  )
)
with check (
  (worker_id = auth.uid() and end_at is null)
  or exists (
    select 1
    from public.complaint_assignments ca_leader
    join public.complaint_assignments ca_target
      on ca_target.id = assignment_work_sessions.assignment_id
     and ca_target.complaint_id = ca_leader.complaint_id
    where ca_leader.worker_id = auth.uid()
      and ca_leader.is_leader = true
  )
);
