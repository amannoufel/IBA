-- Create buildings table
CREATE TABLE buildings (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create rooms table
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    building_id INTEGER REFERENCES buildings(id) NOT NULL,
    room_number TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(building_id, room_number)
);

-- Add new columns to profiles table
ALTER TABLE profiles
ADD COLUMN mobile TEXT,
ADD COLUMN building_id INTEGER REFERENCES buildings(id),
ADD COLUMN room_id INTEGER REFERENCES rooms(id);

-- Enable RLS for new tables
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read buildings and rooms
CREATE POLICY "Anyone can read buildings" ON buildings
    FOR SELECT USING (true);

CREATE POLICY "Anyone can read rooms" ON rooms
    FOR SELECT USING (true);

-- Create function to validate room belongs to building
CREATE OR REPLACE FUNCTION validate_room_building()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.building_id IS NOT NULL AND NEW.room_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM rooms
            WHERE id = NEW.room_id
            AND building_id = NEW.building_id
        ) THEN
            RAISE EXCEPTION 'Room does not belong to the specified building';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for validation
CREATE TRIGGER validate_room_building_trigger
    BEFORE INSERT OR UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION validate_room_building();

-- Insert sample buildings
INSERT INTO buildings (name) VALUES
    ('Building A'),
    ('Building B'),
    ('Building C');

-- Insert sample rooms for each building
INSERT INTO rooms (building_id, room_number)
SELECT b.id, r.room_number
FROM buildings b
CROSS JOIN (
    VALUES ('101'), ('102'), ('103'), ('201'), ('202'), ('203'), ('301'), ('302'), ('303')
) AS r(room_number);
