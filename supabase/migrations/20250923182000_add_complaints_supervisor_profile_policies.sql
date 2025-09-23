-- Allow supervisors to access complaints based on profiles.role as an alternative to JWT metadata
ALTER TABLE IF EXISTS complaints ENABLE ROW LEVEL SECURITY;

-- Read policy via profiles.role
DROP POLICY IF EXISTS "Supervisors can view all complaints (profiles)" ON complaints;
CREATE POLICY "Supervisors can view all complaints (profiles)" ON complaints
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
    )
  );

-- Update policy via profiles.role
DROP POLICY IF EXISTS "Supervisors can update complaints (profiles)" ON complaints;
CREATE POLICY "Supervisors can update complaints (profiles)" ON complaints
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
