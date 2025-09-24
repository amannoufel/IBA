-- Seed default stores and materials for worker assignment details lookups

-- Stores
insert into public.stores (name)
values
  ('Main Warehouse'),
  ('North Depot'),
  ('South Depot'),
  ('Central Supply')
on conflict (name) do nothing;

-- Materials
insert into public.materials (name)
values
  ('Pipe'),
  ('Electrical Cable'),
  ('Air Filter'),
  ('Bolt Set'),
  ('Sealant'),
  ('Thermostat'),
  ('Breaker'),
  ('Pesticide'),
  ('Door Lock'),
  ('Miscellaneous')
on conflict (name) do nothing;
