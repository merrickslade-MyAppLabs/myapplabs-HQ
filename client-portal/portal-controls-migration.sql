-- ============================================================
-- Portal Controls — Project Assignment Migration
-- Run this in the Supabase SQL Editor before using the
-- "Projects" tab in Portal Controls.
-- ============================================================

-- 1. Add portal_user_id to projects
--    Allows each project to be assigned to one portal client.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS portal_user_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_portal_user_id
  ON public.projects(portal_user_id);

-- 2. RLS: portal clients can read their own assigned projects
DROP POLICY IF EXISTS "portal_clients_can_view_own_projects" ON public.projects;
CREATE POLICY "portal_clients_can_view_own_projects"
  ON public.projects FOR SELECT TO authenticated
  USING (portal_user_id = auth.uid());

-- 3. Ensure welcome_message column exists on client_portal_settings
--    (Some setups used 'custom_welcome_message' — this normalises it)
DO $$
BEGIN
  -- If 'custom_welcome_message' exists but 'welcome_message' doesn't, rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'client_portal_settings'
      AND column_name  = 'custom_welcome_message'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'client_portal_settings'
      AND column_name  = 'welcome_message'
  ) THEN
    ALTER TABLE public.client_portal_settings
      RENAME COLUMN custom_welcome_message TO welcome_message;
  END IF;

  -- If neither exists, create it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'client_portal_settings'
      AND column_name  = 'welcome_message'
  ) THEN
    ALTER TABLE public.client_portal_settings
      ADD COLUMN welcome_message text;
  END IF;
END $$;
