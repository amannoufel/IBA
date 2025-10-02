begin;

alter table public.complaint_assignments
  add column if not exists scheduled_start timestamptz null,
  add column if not exists scheduled_end   timestamptz null;

create index if not exists idx_ca_worker_sched on public.complaint_assignments(worker_id, scheduled_start);

create or replace function public.get_worker_busy_windows(_worker_ids uuid[], _day date)
returns table (
  worker_id uuid,
  source text,
  start_at timestamptz,
  end_at timestamptz,
  complaint_id bigint,
  assignment_id bigint
) security definer set search_path = public as $$
  select ca.worker_id,
         'scheduled'::text as source,
         ca.scheduled_start as start_at,
         coalesce(ca.scheduled_end, ca.scheduled_start + interval '1 hour') as end_at,
         ca.complaint_id,
         ca.id as assignment_id
  from public.complaint_assignments ca
  where ca.worker_id = any(_worker_ids)
    and ca.scheduled_start is not null
    and tstzrange((_day)::timestamptz, (_day + 1)::timestamptz, '[)') && tstzrange(ca.scheduled_start, coalesce(ca.scheduled_end, ca.scheduled_start + interval '1 hour'), '[)')

  union all

  select ca.worker_id,
         'actual'::text as source,
         v.time_in as start_at,
         v.time_out as end_at,
         ca.complaint_id,
         ca.id
  from public.assignment_visits v
  join public.complaint_assignments ca on ca.id = v.assignment_id
  where ca.worker_id = any(_worker_ids)
    and v.time_in is not null and v.time_out is not null
    and tstzrange((_day)::timestamptz, (_day + 1)::timestamptz, '[)') && tstzrange(v.time_in, v.time_out, '[)');
$$ language sql;

revoke all on function public.get_worker_busy_windows(uuid[], date) from public;
grant execute on function public.get_worker_busy_windows(uuid[], date) to authenticated;

commit;
