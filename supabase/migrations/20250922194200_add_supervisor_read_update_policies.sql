-- Allow supervisors to view all complaints and profiles, and update complaint status

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;

-- Complaints: supervisors can read all
DROP POLICY IF EXISTS "Supervisors can view all complaints" ON complaints;
CREATE POLICY "Supervisors can view all complaints" ON complaints
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
    )
  );

-- Complaints: supervisors can update (e.g., status)
DROP POLICY IF EXISTS "Supervisors can update complaints" ON complaints;
CREATE POLICY "Supervisors can update complaints" ON complaints
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
    )
  );

-- Profiles: supervisors can read all profiles
DROP POLICY IF EXISTS "Supervisors can view all profiles" ON profiles;
CREATE POLICY "Supervisors can view all profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
    )
  );