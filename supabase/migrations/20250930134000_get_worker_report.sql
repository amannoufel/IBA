-- Worker time & location report via SECURITY DEFINER
-- Returns each worker's work sessions with complaint and store context

begin;

create or replace function public.get_worker_report(
  _start timestamptz default null,
  _end   timestamptz default null,
  _worker uuid default null
)
returns table (
  worker_id uuid,
  worker_name text,
  worker_email text,
  assignment_id bigint,
  complaint_id bigint,
  is_leader boolean,
  status text,
  session_start timestamptz,
  session_end timestamptz,
  session_minutes integer,
  store_id bigint,
  store_name text,
  complaint_desc text
) language sql stable security definer set search_path = public as $$
  with authz as (
    select lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) as role, auth.uid() as uid
  ), base as (
    select aws.*, ca.complaint_id, ca.is_leader, ca.status,
           p.name as worker_name, p.email as worker_email
    from public.assignment_work_sessions aws
    join public.complaint_assignments ca on ca.id = aws.assignment_id
    left join public.profiles p on p.id = aws.worker_id
    join authz a on true
    where aws.end_at is not null
      and aws.end_at >= coalesce(_start, '1970-01-01'::timestamptz)
      and aws.start_at <= coalesce(_end, '9999-12-31'::timestamptz)
      and (_worker is null or aws.worker_id = _worker)
      and (a.role = 'supervisor' or aws.worker_id = a.uid)
  ), visit_match as (
    select b.id as session_id, av.id as visit_id, av.store_id,
           row_number() over (
             partition by b.id
             order by av.time_out desc nulls last,
                      av.time_in desc nulls last,
                      av.created_at desc
           ) as rn
    from base b
    left join public.assignment_visits av
      on av.assignment_id = b.assignment_id
     and (av.time_in is null or av.time_in <= b.end_at)
     and (av.time_out is null or av.time_out >= b.start_at)
  )
  select
    b.worker_id,
    b.worker_name,
    b.worker_email,
    b.assignment_id,
    b.complaint_id,
    coalesce(b.is_leader, false) as is_leader,
    b.status,
    b.start_at as session_start,
    b.end_at as session_end,
    greatest(0, (extract(epoch from (b.end_at - b.start_at)) / 60)::int) as session_minutes,
    vm.store_id,
    st.name as store_name,
    c.description as complaint_desc
  from base b
  left join visit_match vm on vm.session_id = b.id and vm.rn = 1
  left join public.stores st on st.id = vm.store_id
  left join public.complaints c on c.id = b.complaint_id
  order by b.worker_id, b.start_at;
$$;

grant execute on function public.get_worker_report(timestamptz, timestamptz, uuid) to authenticated;

commit;
