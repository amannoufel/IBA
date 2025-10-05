-- Add code column to materials and populate sample codes
alter table public.materials
  add column if not exists code text;

comment on column public.materials.code is 'Short identifier like MG102 or LS508';

-- Backfill example codes where null (simple deterministic mapping by id order)
update public.materials m
set code = sub.new_code
from (
  select id, case
    when row_number() over (order by id) = 1 then 'MG102'
    when row_number() over (order by id) = 2 then 'LS508'
    when row_number() over (order by id) = 3 then 'EL210'
    when row_number() over (order by id) = 4 then 'PL330'
    when row_number() over (order by id) = 5 then 'HV415'
    else 'MAT' || lpad(row_number() over (order by id)::text, 3, '0') end as new_code
  from public.materials
) sub
where m.id = sub.id and (m.code is null or m.code = '');

-- Create an index for quick code searches
create index if not exists materials_code_idx on public.materials using btree (lower(code));
