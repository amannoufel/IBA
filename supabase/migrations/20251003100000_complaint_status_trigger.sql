begin;

-- Ensure valid assignment statuses and support audit on reopen
alter table public.complaint_assignments
  add column if not exists reopened_count integer not null default 0,
  add constraint complaint_assignments_status_check
    check (status in ('assigned','in_progress','pending_review','completed'));

-- Compute complaint.status from its assignments
create or replace function public.update_complaint_status(_complaint_id bigint)
returns void security definer set search_path = public as $$
declare
  total integer;
  any_in_progress integer;
  any_pending_review integer;
  all_completed integer;
begin
  select count(*) into total from public.complaint_assignments where complaint_id = _complaint_id;
  if total = 0 then
    update public.complaints set status = 'pending', updated_at = now() where id = _complaint_id;
    return;
  end if;

  select count(*) > 0 into any_in_progress from public.complaint_assignments where complaint_id = _complaint_id and status = 'in_progress';
  select count(*) > 0 into any_pending_review from public.complaint_assignments where complaint_id = _complaint_id and status = 'pending_review';
  select count(*) = total into all_completed from public.complaint_assignments where complaint_id = _complaint_id and status = 'completed';

  if all_completed then
    update public.complaints set status = 'completed', updated_at = now() where id = _complaint_id;
  elsif any_in_progress or any_pending_review then
    update public.complaints set status = 'in_progress', updated_at = now() where id = _complaint_id;
  else
    update public.complaints set status = 'pending', updated_at = now() where id = _complaint_id;
  end if;
end;
$$ language plpgsql;

-- Trigger on complaint_assignments to update complaint status after changes
create or replace function public.trg_ca_update_complaint_status()
returns trigger security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    perform public.update_complaint_status(OLD.complaint_id);
  else
    perform public.update_complaint_status(NEW.complaint_id);
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists complaint_assignments_update_complaint_status on public.complaint_assignments;
create trigger complaint_assignments_update_complaint_status
after insert or update or delete on public.complaint_assignments
for each row execute function public.trg_ca_update_complaint_status();

commit;
