-- Simplify complaints RLS: allow supervisors via JWT only (no profiles dependency)

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS complaints ENABLE ROW LEVEL SECURITY;

-- Add supervisor read policy via JWT (keep existing tenant policies untouched)
DROP POLICY IF EXISTS "Supervisors can view all complaints" ON complaints;
CREATE POLICY "Supervisors can view all complaints (jwt)" ON complaints
  FOR SELECT TO authenticated
  USING (
    lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );

-- Allow supervisors to update complaints via JWT
DROP POLICY IF EXISTS "Supervisors can update complaints" ON complaints;
CREATE POLICY "Supervisors can update complaints (jwt)" ON complaints
  FOR UPDATE TO authenticated
  USING (
    lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  )
  WITH CHECK (
    lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );