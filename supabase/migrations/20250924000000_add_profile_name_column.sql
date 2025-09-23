-- Add name column to profiles table for displaying user names instead of emails

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name TEXT;

-- Create index for better performance when filtering by name
CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);