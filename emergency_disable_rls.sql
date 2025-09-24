-- EMERGENCY: Temporarily disable RLS to test if policies are the issue
-- Run this in Supabase SQL Editor

-- Disable RLS temporarily on complaints table
ALTER TABLE public.complaints DISABLE ROW LEVEL SECURITY;

-- Re-enable after testing
-- ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;