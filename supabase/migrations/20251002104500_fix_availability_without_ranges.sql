begin;

create or replace function public.get_worker_busy_windows(_worker_ids uuid[], _day date)
returns table (
  worker_id uuid,
  source text,
  start_at timestamptz,
  end_at timestamptz,
  complaint_id bigint,
  assignment_id bigint
) security definer set search_path = public as $$
  with bounds as (
    select 
      ca.worker_id,
      ca.complaint_id,
      ca.id as assignment_id,
      -- normalize scheduled window
      least(ca.scheduled_start, coalesce(ca.scheduled_end, ca.scheduled_start + interval '1 hour')) as s_start,
      greatest(ca.scheduled_start, coalesce(ca.scheduled_end, ca.scheduled_start + interval '1 hour')) as s_end
    from public.complaint_assignments ca
    where ca.worker_id = any(_worker_ids)
      and ca.scheduled_start is not null
  ),
  daywin as (
    select ((_day)::timestamptz) as d_start, ((_day + 1)::timestamptz) as d_end
  ),
  scheduled as (
    select b.worker_id,
           'scheduled'::text as source,
           b.s_start as start_at,
           b.s_end as end_at,
           b.complaint_id,
           b.assignment_id
    from bounds b, daywin d
    where b.s_start is not null and b.s_end is not null and b.s_start <= b.s_end
      and b.s_start < d.d_end and b.s_end > d.d_start -- overlap without ranges
  ),
  actual as (
    select ca.worker_id,
           'actual'::text as source,
           least(v.time_in, v.time_out) as start_at,
           greatest(v.time_in, v.time_out) as end_at,
           ca.complaint_id,
           ca.id as assignment_id
    from public.assignment_visits v
    join public.complaint_assignments ca on ca.id = v.assignment_id
    join daywin d on true
    where ca.worker_id = any(_worker_ids)
      and v.time_in is not null and v.time_out is not null
      and least(v.time_in, v.time_out) <= greatest(v.time_in, v.time_out)
      and least(v.time_in, v.time_out) < d.d_end and greatest(v.time_in, v.time_out) > d.d_start
  )
  select * from scheduled
  union all
  select * from actual;
$$ language sql;

revoke all on function public.get_worker_busy_windows(uuid[], date) from public;
grant execute on function public.get_worker_busy_windows(uuid[], date) to authenticated;

commit;
