begin;

alter table public.complaints
  add column if not exists priority text not null default 'medium',
  add constraint complaint_priority_chk check (priority in ('low','medium','high'));

commit;
