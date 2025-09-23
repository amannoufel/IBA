-- Harden RLS: remove reliance on JWT user_metadata; use a SECURITY DEFINER function instead

-- 1) Create a helper to check if the current user is a supervisor via profiles
create or replace function public.is_supervisor(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and lower(p.role) = 'supervisor'
  );
$$;

-- Restrict and grant execute
revoke all on function public.is_supervisor(uuid) from public;
grant execute on function public.is_supervisor(uuid) to public;

-- 2) Complaints policies: supervisors via function
alter table if exists public.complaints enable row level security;

drop policy if exists "Supervisors can view all complaints" on public.complaints;
create policy "Supervisors can view all complaints" on public.complaints
  for select to authenticated
  using ( public.is_supervisor(auth.uid()) );

drop policy if exists "Supervisors can update complaints" on public.complaints;
create policy "Supervisors can update complaints" on public.complaints
  for update to authenticated
  using ( public.is_supervisor(auth.uid()) )
  with check ( public.is_supervisor(auth.uid()) );

-- 3) Profiles policies: supervisors can view all profiles via function
alter table if exists public.profiles enable row level security;

drop policy if exists "Supervisors can view all profiles" on public.profiles;
drop policy if exists "Supervisors can view all profiles (jwt)" on public.profiles;
create policy "Supervisors can view all profiles (fn)" on public.profiles
  for select to authenticated
  using ( public.is_supervisor(auth.uid()) );

-- 4) Complaint assignments: replace JWT-based supervisor checks with function
alter table if exists public.complaint_assignments enable row level security;

drop policy if exists "Supervisors can view all assignments (jwt)" on public.complaint_assignments;
create policy "Supervisors can view all assignments" on public.complaint_assignments
  for select to authenticated
  using ( public.is_supervisor(auth.uid()) );

drop policy if exists "Supervisors can create assignments (jwt)" on public.complaint_assignments;
create policy "Supervisors can create assignments" on public.complaint_assignments
  for insert to authenticated
  with check ( public.is_supervisor(auth.uid()) );

-- Update policy: keep worker access and allow supervisors
drop policy if exists "Update assignment (supervisor or assignee)" on public.complaint_assignments;
create policy "Update assignment (supervisor or assignee)" on public.complaint_assignments
  for update to authenticated
  using ( worker_id = auth.uid() or public.is_supervisor(auth.uid()) )
  with check ( worker_id = auth.uid() or public.is_supervisor(auth.uid()) );

-- Delete policy: supervisors only
drop policy if exists "Supervisors can delete assignments" on public.complaint_assignments;
create policy "Supervisors can delete assignments" on public.complaint_assignments
  for delete to authenticated
  using ( public.is_supervisor(auth.uid()) );
