-- Secure function to fetch all teammates for an assignment
-- Returns all workers assigned to the same complaint, provided the caller is
-- either (a) a worker assigned to that complaint, or (b) a supervisor.

begin;

create or replace function public.get_teammates_for_assignment(aid bigint)
returns table (
  assignment_id bigint,
  worker_id uuid,
  is_leader boolean,
  email text,
  name text
) language sql stable security definer set search_path = public as $$
  with base as (
    select complaint_id
    from public.complaint_assignments
    where id = aid
    limit 1
  ), authorized as (
    select (
      exists (
        select 1
        from public.complaint_assignments ca2
        join base b on ca2.complaint_id = b.complaint_id
        where ca2.worker_id = auth.uid()
      )
      or lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
    ) as ok
  )
  select ca.id as assignment_id,
         ca.worker_id,
         coalesce(ca.is_leader, false) as is_leader,
         p.email,
         p.name
  from public.complaint_assignments ca
  join base b on ca.complaint_id = b.complaint_id
  join authorized a on a.ok
  left join public.profiles p on p.id = ca.worker_id
  where a.ok;
$$;

grant execute on function public.get_teammates_for_assignment(bigint) to authenticated;

commit;
