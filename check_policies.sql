-- Check all current policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename IN ('complaints', 'profiles') 
ORDER BY tablename, policyname;

-- Check if our helper function exists
SELECT proname, prosrc, prorettype::regtype, proargnames, proargtypes::regtype[]
FROM pg_proc 
WHERE proname = 'is_supervisor';

-- Check profiles table structure and data
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if there are any supervisors in profiles
SELECT id, email, role, name FROM profiles WHERE lower(role) = 'supervisor' LIMIT 5;