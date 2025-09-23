-- Fix recursive profiles policy causing 42P17
-- Ensure RLS is enabled on profiles and replace recursive policy with JWT-only check

ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;

-- Remove the recursive policy variant
DROP POLICY IF EXISTS "Supervisors can view all profiles" ON profiles;

-- Recreate a non-recursive, JWT-only supervisor read policy
CREATE POLICY "Supervisors can view all profiles (jwt)" ON profiles
  FOR SELECT TO authenticated
  USING (
    lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );
