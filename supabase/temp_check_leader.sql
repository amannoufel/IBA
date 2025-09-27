-- Check if is_leader column exists
select 'complaint_assignments.is_leader exists' as description
from information_schema.columns
where table_name='complaint_assignments' and column_name='is_leader';

-- List policies on assignment_details and assignment_materials
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where tablename in ('assignment_details','assignment_materials')
order by tablename, policyname;
