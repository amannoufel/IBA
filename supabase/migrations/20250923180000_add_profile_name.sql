-- Add name to profiles for displaying user full names across roles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS name TEXT;
