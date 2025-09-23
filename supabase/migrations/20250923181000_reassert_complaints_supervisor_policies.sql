-- Ensure complaints RLS supervisor policies exist and are JWT-based
ALTER TABLE IF EXISTS complaints ENABLE ROW LEVEL SECURITY;

-- Supervisor read policy
DROP POLICY IF EXISTS "Supervisors can view all complaints (jwt)" ON complaints;
CREATE POLICY "Supervisors can view all complaints (jwt)" ON complaints
  FOR SELECT TO authenticated
  USING (
    lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );

-- Supervisor update policy
DROP POLICY IF EXISTS "Supervisors can update complaints (jwt)" ON complaints;
CREATE POLICY "Supervisors can update complaints (jwt)" ON complaints
  FOR UPDATE TO authenticated
  USING (
    lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  )
  WITH CHECK (
    lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
  );
