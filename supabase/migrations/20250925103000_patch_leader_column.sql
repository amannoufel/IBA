-- Idempotent patch to ensure leader functionality is actually in the database
-- This migration ONLY adds missing objects (column, index, policies) if they do not yet exist.
-- Safe to re-run (guards used) and does not touch existing data values.

-- 1. Add is_leader column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'complaint_assignments' AND column_name = 'is_leader'
  ) THEN
    ALTER TABLE public.complaint_assignments
      ADD COLUMN is_leader boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Ensure only one leader per complaint via unique partial index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'one_leader_per_complaint'
  ) THEN
    CREATE UNIQUE INDEX one_leader_per_complaint
      ON public.complaint_assignments (complaint_id)
      WHERE is_leader;
  END IF;
END $$;

-- 3. Policies for assignment_details and assignment_materials so only leader can write
-- Assumptions:
--   assignment_details has column assignment_id referencing complaint_assignments.id
--   assignment_materials has column assignment_id referencing complaint_assignments.id
--   complaint_assignments has worker_id and is_leader columns
-- If table names / columns differ, adjust accordingly.

-- Helper function to create a policy only if absent
CREATE OR REPLACE FUNCTION public.__create_policy_if_not_exists(
  p_policy_name text,
  p_table regclass,
  p_cmd text,
  p_using text,
  p_check text
) RETURNS void AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT TRUE INTO v_exists FROM pg_policies WHERE policyname = p_policy_name AND tablename = split_part(p_table::text, '.', 2);
  IF NOT v_exists THEN
    EXECUTE format(
      'CREATE POLICY %I ON %s FOR %s USING (%s)%s',
      p_policy_name,
      p_table,
      p_cmd,
      p_using,
      CASE WHEN p_check IS NOT NULL THEN format(' WITH CHECK (%s)', p_check) ELSE '' END
    );
  END IF;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow all assigned workers to read details/materials
SELECT public.__create_policy_if_not_exists(
  'allow_assigned_workers_read_details',
  'public.assignment_details',
  'SELECT',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid())',
  NULL
);
SELECT public.__create_policy_if_not_exists(
  'allow_assigned_workers_read_materials',
  'public.assignment_materials',
  'SELECT',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid())',
  NULL
);

-- Allow only leader to insert/update/delete details/materials
SELECT public.__create_policy_if_not_exists(
  'allow_leader_manage_details',
  'public.assignment_details',
  'INSERT',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid() AND ca.is_leader)',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid() AND ca.is_leader)'
);
SELECT public.__create_policy_if_not_exists(
  'allow_leader_update_details',
  'public.assignment_details',
  'UPDATE',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid() AND ca.is_leader)',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid() AND ca.is_leader)'
);
SELECT public.__create_policy_if_not_exists(
  'allow_leader_delete_details',
  'public.assignment_details',
  'DELETE',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid() AND ca.is_leader)',
  NULL
);

SELECT public.__create_policy_if_not_exists(
  'allow_leader_manage_materials',
  'public.assignment_materials',
  'INSERT',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid() AND ca.is_leader)',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid() AND ca.is_leader)'
);
SELECT public.__create_policy_if_not_exists(
  'allow_leader_update_materials',
  'public.assignment_materials',
  'UPDATE',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid() AND ca.is_leader)',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid() AND ca.is_leader)'
);
SELECT public.__create_policy_if_not_exists(
  'allow_leader_delete_materials',
  'public.assignment_materials',
  'DELETE',
  'EXISTS (SELECT 1 FROM public.complaint_assignments ca WHERE ca.id = assignment_id AND ca.worker_id = auth.uid() AND ca.is_leader)',
  NULL
);

-- Clean up helper function (optional). Comment out if you want to keep it for future migrations.
DROP FUNCTION public.__create_policy_if_not_exists;
