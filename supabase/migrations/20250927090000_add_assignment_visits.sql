-- Assignment visits model: multiple visits per assignment, leader-controlled writes
-- Idempotent creation + backfill from legacy assignment_details/materials

-- 1) Tables
create table if not exists public.assignment_visits (
  id bigserial primary key,
  assignment_id bigint not null references public.complaint_assignments(id) on delete cascade,
  store_id bigint references public.stores(id),
  time_in timestamptz not null default now(),
  time_out timestamptz null,
  note text null,
  outcome text check (outcome in ('completed','revisit')) null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_visit_materials (
  visit_id bigint not null references public.assignment_visits(id) on delete cascade,
  material_id bigint not null references public.materials(id) on delete cascade,
  qty numeric null,
  created_at timestamptz not null default now(),
  primary key (visit_id, material_id)
);

-- Ensure only one open visit (time_out is null) per assignment
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='uniq_open_visit_per_assignment'
  ) then
    create unique index uniq_open_visit_per_assignment on public.assignment_visits(assignment_id) where time_out is null;
  end if;
end $$;

-- 2) RLS
alter table if exists public.assignment_visits enable row level security;
alter table if exists public.assignment_visit_materials enable row level security;

-- Helper: jwt role supervisor check (inline in policies below)

-- Read policies: assigned workers or supervisors can read
drop policy if exists "visits_read_assigned_or_supervisor" on public.assignment_visits;
create policy "visits_read_assigned_or_supervisor" on public.assignment_visits
  for select to authenticated
  using (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id and (
        ca.worker_id = auth.uid() or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
      )
    )
  );

drop policy if exists "visit_mats_read_assigned_or_supervisor" on public.assignment_visit_materials;
create policy "visit_mats_read_assigned_or_supervisor" on public.assignment_visit_materials
  for select to authenticated
  using (
    exists (
      select 1 from public.assignment_visits v
      join public.complaint_assignments ca on ca.id = v.assignment_id
      where v.id = visit_id and (
        ca.worker_id = auth.uid() or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
      )
    )
  );

-- Write policies: leader only; updates allowed only while open (time_out is null)
drop policy if exists "visits_insert_leader" on public.assignment_visits;
create policy "visits_insert_leader" on public.assignment_visits
  for insert to authenticated
  with check (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id and ca.worker_id = auth.uid() and ca.is_leader = true
    )
  );

drop policy if exists "visits_update_leader_open_only" on public.assignment_visits;
create policy "visits_update_leader_open_only" on public.assignment_visits
  for update to authenticated
  using (
    time_out is null and exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id and ca.worker_id = auth.uid() and ca.is_leader = true
    )
  )
  with check (true);

-- Manage visit materials (insert/update/delete) by leader for visits under their assignment
drop policy if exists "visit_mats_cud_leader" on public.assignment_visit_materials;
create policy "visit_mats_cud_leader" on public.assignment_visit_materials
  for all to authenticated
  using (
    exists (
      select 1 from public.assignment_visits v
      join public.complaint_assignments ca on ca.id = v.assignment_id
      where v.id = visit_id and ca.worker_id = auth.uid() and ca.is_leader = true
    )
  )
  with check (true);

-- 3) Backfill from legacy tables if this is the first time
-- Insert one visit per existing assignment_details row
insert into public.assignment_visits (assignment_id, store_id, time_in, time_out, note, outcome, created_by, created_at)
select d.assignment_id,
       d.store_id,
       d.time_in,
       d.time_out,
       d.note,
       case when coalesce(d.needs_revisit, false) then 'revisit'
            when d.time_out is not null then 'completed'
            else null end as outcome,
       coalesce(ca.worker_id, '00000000-0000-0000-0000-000000000000') as created_by,
       d.created_at
from public.assignment_details d
left join public.complaint_assignments ca on ca.id = d.assignment_id
where not exists (
  select 1 from public.assignment_visits v where v.assignment_id = d.assignment_id
);

-- Copy materials to the visit we just created per assignment
insert into public.assignment_visit_materials (visit_id, material_id)
select v.id as visit_id, am.material_id
from public.assignment_materials am
join public.assignment_visits v on v.assignment_id = am.assignment_id
where v.id in (
  select max(v2.id) from public.assignment_visits v2 group by v2.assignment_id
)
and not exists (
  select 1 from public.assignment_visit_materials vm
  where vm.visit_id = v.id and vm.material_id = am.material_id
);

-- 4) Latest visit view for convenience
create or replace view public.assignment_visits_latest as
select distinct on (assignment_id)
  id as visit_id,
  assignment_id,
  store_id,
  time_in,
  time_out,
  (outcome = 'revisit') as needs_revisit,
  created_at
from public.assignment_visits
order by assignment_id, created_at desc;