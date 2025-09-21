-- Create complaint types table
CREATE TABLE complaint_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create complaints table
CREATE TABLE complaints (
    id SERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES auth.users(id) NOT NULL,
    type_id INTEGER REFERENCES complaint_types(id) NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE complaint_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- Allow tenants to read complaint types
CREATE POLICY "Anyone can read complaint types" ON complaint_types
    FOR SELECT USING (true);

-- Allow tenants to create their own complaints
CREATE POLICY "Tenants can create their own complaints" ON complaints
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = tenant_id);

-- Allow tenants to read their own complaints
CREATE POLICY "Tenants can view their own complaints" ON complaints
    FOR SELECT TO authenticated
    USING (auth.uid() = tenant_id);

-- Insert initial complaint types
INSERT INTO complaint_types (name) VALUES
    ('Plumbing'),
    ('Electrical'),
    ('Air Conditioning'),
    ('Heating'),
    ('Appliance'),
    ('Structural'),
    ('Pest Control'),
    ('Security'),
    ('Noise'),
    ('Other');

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_complaints_updated_at
    BEFORE UPDATE ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
