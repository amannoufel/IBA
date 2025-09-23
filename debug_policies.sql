-- Check current policies on complaints table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'complaints' 
ORDER BY policyname;

-- Check if our helper function exists
SELECT proname, prosrc, prorettype, proargnames, proargtypes
FROM pg_proc 
WHERE proname = 'is_supervisor';

-- Check profiles table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;