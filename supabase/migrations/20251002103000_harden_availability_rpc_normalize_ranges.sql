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
  -- Scheduled windows: coalesce end, and guard against inverted times by ordering with least/greatest
  select ca.worker_id,
         'scheduled'::text as source,
         least(ca.scheduled_start, coalesce(ca.scheduled_end, ca.scheduled_start + interval '1 hour')) as start_at,
         greatest(ca.scheduled_start, coalesce(ca.scheduled_end, ca.scheduled_start + interval '1 hour')) as end_at,
         ca.complaint_id,
         ca.id as assignment_id
  from public.complaint_assignments ca
  where ca.worker_id = any(_worker_ids)
    and ca.scheduled_start is not null
    and tstzrange((_day)::timestamptz, (_day + 1)::timestamptz, '[)') &&
        tstzrange(
          least(ca.scheduled_start, coalesce(ca.scheduled_end, ca.scheduled_start + interval '1 hour')),
          greatest(ca.scheduled_start, coalesce(ca.scheduled_end, ca.scheduled_start + interval '1 hour')),
          '[)'
        )

  union all

  -- Actual visit windows: guard against any bad data (if time_out < time_in) by ordering as well
  select ca.worker_id,
         'actual'::text as source,
         least(v.time_in, v.time_out) as start_at,
         greatest(v.time_in, v.time_out) as end_at,
         ca.complaint_id,
         ca.id
  from public.assignment_visits v
  join public.complaint_assignments ca on ca.id = v.assignment_id
  where ca.worker_id = any(_worker_ids)
    and v.time_in is not null and v.time_out is not null
    and tstzrange((_day)::timestamptz, (_day + 1)::timestamptz, '[)') &&
        tstzrange(least(v.time_in, v.time_out), greatest(v.time_in, v.time_out), '[)');
$$ language sql;

revoke all on function public.get_worker_busy_windows(uuid[], date) from public;
grant execute on function public.get_worker_busy_windows(uuid[], date) to authenticated;

commit;
