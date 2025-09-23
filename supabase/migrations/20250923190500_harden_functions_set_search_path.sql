-- Ensure functions have deterministic search_path and avoid Security Advisor warnings

-- 1) Replace update_updated_at_column with explicit search_path
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.update_updated_at_column() from public;
grant execute on function public.update_updated_at_column() to public;

-- 2) Replace set_updated_at with explicit search_path
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to public;

-- 3) Provide a safe get_my_role function (used by tools/policies if referenced)
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.role, '') from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.get_my_role() from public;
grant execute on function public.get_my_role() to public;
