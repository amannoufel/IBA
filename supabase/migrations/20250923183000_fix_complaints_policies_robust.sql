-- Debug: Check complaints policies and remove any potentially conflicting ones
-- The JWT shows no user_metadata.role, so JWT-only policies will fail

-- First, let's see what policies exist and clean them up
DO $$
BEGIN
    -- Drop all existing supervisor policies to start clean
    DROP POLICY IF EXISTS "Supervisors can view all complaints" ON complaints;
    DROP POLICY IF EXISTS "Supervisors can view all complaints (jwt)" ON complaints;
    DROP POLICY IF EXISTS "Supervisors can view all complaints (profiles)" ON complaints;
    DROP POLICY IF EXISTS "Supervisors can update complaints" ON complaints;
    DROP POLICY IF EXISTS "Supervisors can update complaints (jwt)" ON complaints;
    DROP POLICY IF EXISTS "Supervisors can update complaints (profiles)" ON complaints;
    
    -- Ensure RLS is enabled
    ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
    
    -- Create a robust supervisor read policy that tries profiles.role first (more reliable)
    CREATE POLICY "Supervisors can view all complaints" ON complaints
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
        )
        OR 
        lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
      );
    
    -- Create a robust supervisor update policy
    CREATE POLICY "Supervisors can update complaints" ON complaints
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
        )
        OR 
        lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
        )
        OR 
        lower(coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'supervisor'
      );
END $$;