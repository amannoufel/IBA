-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS validate_room_building_trigger ON profiles;
DROP FUNCTION IF EXISTS validate_room_building();

-- Drop foreign key constraints from profiles table
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_building_id_fkey,
DROP CONSTRAINT IF EXISTS profiles_room_id_fkey;

-- Add new text columns to profiles
ALTER TABLE profiles
ADD COLUMN building_name TEXT,
ADD COLUMN room_number TEXT;

-- Copy data from the old structure to the new one (if needed)
UPDATE profiles p
SET 
    building_name = b.name,
    room_number = r.room_number
FROM buildings b
JOIN rooms r ON r.building_id = b.id
WHERE p.building_id = b.id AND p.room_id = r.id;

-- Drop the old columns
ALTER TABLE profiles
DROP COLUMN IF EXISTS building_id,
DROP COLUMN IF EXISTS room_id;

-- Drop the tables
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS buildings;