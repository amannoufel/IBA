-- Add lookup tables and assignment details for worker updates

-- Stores lookup
create table if not exists public.stores (
  id bigserial primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Materials lookup
create table if not exists public.materials (
  id bigserial primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Assignment details (one row per assignment)
create table if not exists public.assignment_details (
  id bigserial primary key,
  assignment_id bigint not null references public.complaint_assignments(id) on delete cascade,
  store_id bigint references public.stores(id),
  time_in timestamptz,
  time_out timestamptz,
  needs_revisit boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id)
);

-- Materials used per assignment (many-to-many)
create table if not exists public.assignment_materials (
  assignment_id bigint not null references public.assignment_details(assignment_id) on delete cascade,
  material_id bigint not null references public.materials(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (assignment_id, material_id)
);

-- Triggers to maintain updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_updated_at_stores on public.stores;
create trigger trg_updated_at_stores before update on public.stores
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_updated_at_materials on public.materials;
create trigger trg_updated_at_materials before update on public.materials
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_updated_at_assignment_details on public.assignment_details;
create trigger trg_updated_at_assignment_details before update on public.assignment_details
for each row execute procedure public.set_updated_at();

-- RLS
alter table if exists public.stores enable row level security;
alter table if exists public.materials enable row level security;
alter table if exists public.assignment_details enable row level security;
alter table if exists public.assignment_materials enable row level security;

-- Allow all authenticated users to read lookup tables
drop policy if exists "Read stores (auth)" on public.stores;
create policy "Read stores (auth)" on public.stores
  for select to authenticated using (active);

drop policy if exists "Read materials (auth)" on public.materials;
create policy "Read materials (auth)" on public.materials
  for select to authenticated using (active);

-- Workers can read/modify details for their assignments; supervisors can read
drop policy if exists "Select assignment details (worker or supervisor)" on public.assignment_details;
create policy "Select assignment details (worker or supervisor)" on public.assignment_details
  for select to authenticated
  using (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id
        and (ca.worker_id = auth.uid()
             or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor')
    )
  );

drop policy if exists "Upsert assignment details (worker only)" on public.assignment_details;
create policy "Upsert assignment details (worker only)" on public.assignment_details
  for insert to authenticated
  with check (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id and ca.worker_id = auth.uid()
    )
  );

drop policy if exists "Update assignment details (worker only)" on public.assignment_details;
create policy "Update assignment details (worker only)" on public.assignment_details
  for update to authenticated
  using (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id and ca.worker_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id and ca.worker_id = auth.uid()
    )
  );

-- Assignment materials policies
drop policy if exists "Select assignment materials (worker or supervisor)" on public.assignment_materials;
create policy "Select assignment materials (worker or supervisor)" on public.assignment_materials
  for select to authenticated
  using (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id
        and (ca.worker_id = auth.uid()
             or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor')
    )
  );

drop policy if exists "Insert assignment materials (worker only)" on public.assignment_materials;
create policy "Insert assignment materials (worker only)" on public.assignment_materials
  for insert to authenticated
  with check (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id and ca.worker_id = auth.uid()
    )
  );

drop policy if exists "Delete assignment materials (worker only)" on public.assignment_materials;
create policy "Delete assignment materials (worker only)" on public.assignment_materials
  for delete to authenticated
  using (
    exists (
      select 1 from public.complaint_assignments ca
      where ca.id = assignment_id and ca.worker_id = auth.uid()
    )
  );
