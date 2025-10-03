begin;

create or replace function public.update_complaint_status(_complaint_id bigint)
returns void security definer set search_path = public as $$
declare
  total integer;
  any_in_progress boolean;
  any_pending_review boolean;
  all_completed boolean;
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

commit;
