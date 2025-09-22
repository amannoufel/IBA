-- Create a public storage bucket for complaint images (idempotent)
insert into storage.buckets (id, name, public)
values ('complaint-images', 'complaint-images', true)
on conflict (id) do nothing;

-- Add image_path to complaints table
alter table public.complaints
  add column if not exists image_path text null;

-- Optional: index to query by tenant and created_at
create index if not exists complaints_tenant_created_idx on public.complaints (tenant_id, created_at desc);

-- RLS policies for storage objects in complaint-images bucket
-- Ensure any pre-existing policies with the same name are dropped for idempotence
drop policy if exists "tenants can upload complaint images" on storage.objects;
drop policy if exists "tenants can modify own complaint images" on storage.objects;
drop policy if exists "tenants can delete own complaint images" on storage.objects;
drop policy if exists "tenants can view own complaint images" on storage.objects;
-- Allow authenticated users to insert objects under a path prefixed by their user id, e.g., `${auth.uid()}/<filename>`
create policy "tenants can upload complaint images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'complaint-images'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- Allow authenticated users to update/delete only their own images
create policy "tenants can modify own complaint images" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'complaint-images'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'complaint-images'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "tenants can delete own complaint images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'complaint-images'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- Allow authenticated users to view only their own images via the API (public bucket also allows public access via public URL)
create policy "tenants can view own complaint images" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'complaint-images'
    and split_part(name, '/', 1) = auth.uid()::text
  );
