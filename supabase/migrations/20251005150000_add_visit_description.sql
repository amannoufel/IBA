-- Add description/note column for worker job details
alter table if exists public.assignment_visits
  add column if not exists note text;

-- No backfill needed; optional free text.
