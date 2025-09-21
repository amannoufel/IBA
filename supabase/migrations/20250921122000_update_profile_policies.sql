-- Create a policy that allows anyone to insert during signup
DROP POLICY IF EXISTS "Enable insert for signup" ON profiles;

CREATE POLICY "Enable insert for signup" ON profiles
    FOR INSERT
    WITH CHECK (true);  -- This allows any insert, but we control this through our application logic

-- Update the view policy to allow the owner to view their profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT
    USING (auth.uid() = id);