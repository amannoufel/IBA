-- Add area column to profiles to store where the tenant lives
-- Chosen as simple text to allow future expansion without more migrations.
-- UI currently constrains choices to: garrafa, al hilal, lusail

alter table public.profiles
  add column if not exists area text;

comment on column public.profiles.area is 'Residential area / district of the tenant (e.g., garrafa, al hilal, lusail)';
