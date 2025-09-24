-- STEP BY STEP DEBUGGING FOR COMPLAINTS API 400 ERROR

-- STEP 1: Run this first to see current state
SELECT 
  'Current RLS Status' as check_type,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('complaints', 'profiles') 
  AND schemaname = 'public';

-- STEP 2: Check what policies exist
SELECT 
  'Current Policies' as check_type,
  tablename,
  policyname,
  cmd,
  permissive,
  roles
FROM pg_policies 
WHERE tablename IN ('complaints', 'profiles')
ORDER BY tablename, policyname;

-- STEP 3: Check if helper function exists
SELECT 
  'Helper Function' as check_type,
  proname,
  prosecdef as is_security_definer,
  provolatile as volatility
FROM pg_proc 
WHERE proname = 'is_supervisor';

-- STEP 4: If the 400 persists, temporarily disable RLS to isolate the issue
-- UNCOMMENT ONLY IF NEEDED:
-- ALTER TABLE public.complaints DISABLE ROW LEVEL SECURITY;

-- STEP 5: Test a simple query
-- SELECT COUNT(*) FROM public.complaints;

-- STEP 6: Re-enable RLS if you disabled it
-- ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;