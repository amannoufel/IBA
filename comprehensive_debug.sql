-- COMPREHENSIVE SUPABASE DEBUGGING SCRIPT
-- Run this in the Supabase SQL Editor to see the complete state

-- 1. Check all RLS policies on complaints and profiles
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('complaints', 'profiles')
ORDER BY tablename, policyname;

-- 2. Check if our helper function exists and its definition
SELECT 
  proname as function_name,
  prosrc as source_code,
  prorettype::regtype as return_type,
  proargnames as argument_names,
  proargtypes::regtype[] as argument_types,
  prosecdef as is_security_definer
FROM pg_proc 
WHERE proname = 'is_supervisor';

-- 3. Check table structure
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name IN ('complaints', 'profiles') 
  AND table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 4. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('complaints', 'profiles') 
  AND schemaname = 'public';

-- 5. Sample data from profiles (to see role values)
SELECT 
  id,
  email,
  role,
  created_at
FROM profiles 
ORDER BY created_at DESC 
LIMIT 10;

-- 6. Test the helper function if it exists (replace with actual user ID)
-- SELECT public.is_supervisor('actual-user-id-here');

-- 7. Check for any complaints data
SELECT COUNT(*) as complaint_count FROM complaints;

-- 8. Check migration history
SELECT 
  version,
  executed_at
FROM supabase_migrations.schema_migrations 
ORDER BY executed_at DESC 
LIMIT 10;