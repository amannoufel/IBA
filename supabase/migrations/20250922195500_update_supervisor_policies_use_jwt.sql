-- Update supervisor policies to accept JWT user_metadata role or profiles.role

-- Complaints: allow supervisors to SELECT and UPDATE when either:
-- - The user's profile has role 'supervisor', or
-- - The JWT user_metadata.role is 'supervisor'

DROP POLICY IF EXISTS "Supervisors can view all complaints" ON complaints;
CREATE POLICY "Supervisors can view all complaints" ON complaints
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
    )
    OR lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );

DROP POLICY IF EXISTS "Supervisors can update complaints" ON complaints;
CREATE POLICY "Supervisors can update complaints" ON complaints
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
    )
    OR lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
    )
    OR lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );

-- Profiles: supervisors can read all profiles with the same criteria
DROP POLICY IF EXISTS "Supervisors can view all profiles" ON profiles;
CREATE POLICY "Supervisors can view all profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
    )
    OR lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );