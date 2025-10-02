begin;

create or replace function public.get_complaint_report(
  _start timestamptz default null,
  _end timestamptz default null
) returns table (
  complaint_id bigint,
  created_at timestamptz,
  tenant_id uuid,
  tenant_name text,
  tenant_email text,
  building text,
  flat text,
  description text,
  staff text,
  work_details jsonb
) security definer set search_path = public as $$
  with base as (
    select c.id as complaint_id,
           c.created_at,
           c.tenant_id,
           tp.name as tenant_name,
           tp.email as tenant_email,
           tp.building_name as building,
           tp.room_number as flat,
           c.description
    from public.complaints c
    left join public.profiles tp on tp.id = c.tenant_id
    where (_start is null or c.created_at >= _start)
      and (_end is null or c.created_at <= _end)
  ),
  staff as (
    select ca.complaint_id,
           string_agg(coalesce(p.name, p.email, p.id::text), ', ' order by p.name nulls last, p.email nulls last) as staff
    from public.complaint_assignments ca
    left join public.profiles p on p.id = ca.worker_id
    group by ca.complaint_id
  ),
  visits as (
    select ca.complaint_id,
           jsonb_agg(
             jsonb_build_object(
               'assignment_id', ca.id,
               'worker_id', ca.worker_id,
               'worker_name', pw.name,
               'worker_email', pw.email,
               'store_id', v.store_id,
               'store_name', s.name,
               'time_in', v.time_in,
               'time_out', v.time_out,
               'needs_revisit', coalesce((v.outcome = 'revisit'), false),
               'materials', (
                  select coalesce(jsonb_agg(m.name order by m.name), '[]'::jsonb)
                  from public.assignment_visit_materials avm
                  join public.materials m on m.id = avm.material_id
                  where avm.visit_id = v.id
               )
             ) order by v.time_in nulls last
           ) as work_details
    from public.complaint_assignments ca
    left join public.profiles pw on pw.id = ca.worker_id
    left join public.assignment_visits v on v.assignment_id = ca.id
    left join public.stores s on s.id = v.store_id
    group by ca.complaint_id
  )
  select b.complaint_id,
         b.created_at,
         b.tenant_id,
         b.tenant_name,
         b.tenant_email,
         b.building,
         b.flat,
         b.description,
         coalesce(st.staff, '') as staff,
         coalesce(v.work_details, '[]'::jsonb) as work_details
  from base b
  left join staff st on st.complaint_id = b.complaint_id
  left join visits v on v.complaint_id = b.complaint_id
  order by b.created_at desc, b.complaint_id desc;
$$ language sql;

revoke all on function public.get_complaint_report(timestamptz, timestamptz) from public;
grant execute on function public.get_complaint_report(timestamptz, timestamptz) to authenticated;

commit;
