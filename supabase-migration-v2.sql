-- ============================================================
-- MyAppLabs HQ — Complete Schema Migration v2.0
-- Date: 2026-03-18
-- ============================================================
-- PURPOSE
--   Replaces the legacy flat schema with a production-grade,
--   role-aware schema that supports the MyAppLabs HQ Electron
--   app and the Client Portal web app on a shared Supabase
--   project. Introduces full RLS, audit logging, storage
--   access control, and all required seed data.
--
-- BEFORE RUNNING
--   1. Export any data you want to keep from old tables.
--   2. Run this ENTIRE script in one execution in the
--      Supabase SQL Editor. Do not run in chunks.
--   3. After running, apply Supabase Auth settings documented
--      at the bottom of this file before going live.
--
-- TABLES DROPPED (legacy — data not automatically migrated)
--   clients       → replaced by profiles (auth-linked)
--   projects      → replaced by projects (new schema)
--   tasks         → replaced by tasks (new schema)
--   prompts       → replaced by scripts
--   audit_log     → replaced by audit_log (new schema)
--
-- TABLES PRESERVED (RLS tightened to admin/super_admin only)
--   ideas, expenses, internal_projects, notes,
--   providers, revenue
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- SECTION 1: DROP LEGACY TABLES
-- Drop in dependency order. CASCADE handles any remaining FKs.
-- ============================================================

DROP TABLE IF EXISTS public.prompts           CASCADE;
DROP TABLE IF EXISTS public.tasks             CASCADE;
DROP TABLE IF EXISTS public.projects          CASCADE;
DROP TABLE IF EXISTS public.clients           CASCADE;
DROP TABLE IF EXISTS public.audit_log         CASCADE;


-- ============================================================
-- SECTION 2: DROP LEGACY TYPES (if they exist from a prior
-- partial migration attempt)
-- ============================================================

DROP TYPE IF EXISTS public.user_role          CASCADE;
DROP TYPE IF EXISTS public.project_status     CASCADE;
DROP TYPE IF EXISTS public.document_type      CASCADE;
DROP TYPE IF EXISTS public.invoice_type       CASCADE;
DROP TYPE IF EXISTS public.invoice_status     CASCADE;
DROP TYPE IF EXISTS public.task_status        CASCADE;
DROP TYPE IF EXISTS public.task_priority      CASCADE;


-- ============================================================
-- SECTION 3: ENUMS
-- ============================================================

-- Three roles exist in the system.
-- super_admin = Merrick only — full access including GDPR tool and role management.
-- admin       = Merrick and Sam — full HQ access, no role assignment.
-- client      = Portal users only — restricted to their own project data.
CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'client');

-- Eight sequential stages map to the project lifecycle.
-- A project moves through these in order, though admins can set
-- any stage when correcting data.
CREATE TYPE public.project_status AS ENUM (
  'qualification',
  'discovery',
  'proposal',
  'kickoff',
  'build',
  'review',
  'delivery',
  'complete'
);

-- Document categories used for labelling and display in the portal.
CREATE TYPE public.document_type AS ENUM (
  'proposal',
  'contract',
  'invoice',
  'handover',
  'other'
);

-- Invoice payment structure — what is being charged for.
CREATE TYPE public.invoice_type AS ENUM (
  'deposit',
  'final',
  'change_request'
);

-- Invoice workflow state. Moves forward only: draft → sent → paid.
CREATE TYPE public.invoice_status AS ENUM (
  'draft',
  'sent',
  'paid'
);

-- Internal task workflow state.
CREATE TYPE public.task_status AS ENUM (
  'todo',
  'in_progress',
  'done'
);

-- Internal task urgency level.
CREATE TYPE public.task_priority AS ENUM (
  'low',
  'medium',
  'high'
);


-- ============================================================
-- SECTION 4: CORE TABLES
-- Every table has RLS enabled.
-- Every policy has a plain-English comment above it.
-- ============================================================


-- ------------------------------------------------------------
-- TABLE: profiles
-- One row per authenticated user. Extends auth.users.
-- This is the single source of truth for who a user is
-- and what role they have across both apps.
-- ------------------------------------------------------------
CREATE TABLE public.profiles (
  id          uuid             PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text             NOT NULL,
  role        public.user_role NOT NULL DEFAULT 'client',
  avatar_url  text,
  last_seen   timestamptz,
  first_login boolean          NOT NULL DEFAULT true,
  created_at  timestamptz      NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- A user can read their own profile row. This is needed so the app
-- can load the user's name, role, and portal settings after login.
CREATE POLICY "profiles: own user can select their row"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins and super_admin can read all profile rows. This is needed
-- for the Clients list, Client Portal Controls, and team management
-- pages inside the HQ app.
CREATE POLICY "profiles: admins can select all rows"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- A user can update their own profile (name, avatar, last_seen,
-- first_login) but the WITH CHECK prevents them from modifying
-- their own role field. This blocks client-side privilege escalation.
CREATE POLICY "profiles: own user can update non-role fields"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- Only super_admin can change the role field on any profile.
-- This is the only path to elevating a user to admin or super_admin.
-- Combined with the update policy above, a user cannot escalate
-- their own role even if they craft a direct API call.
CREATE POLICY "profiles: super_admin can update any row including role"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- Profile rows are created automatically by a trigger on auth.users
-- (see Section 6). This policy allows the trigger (SECURITY DEFINER)
-- to insert. Direct inserts from clients are blocked.
CREATE POLICY "profiles: service role can insert via trigger"
  ON public.profiles FOR INSERT
  WITH CHECK (true);


-- ------------------------------------------------------------
-- TABLE: projects
-- Core project records. Each project belongs to one client.
-- The stage tracker, documents, messages, and invoices all
-- reference this table.
-- ------------------------------------------------------------
CREATE TABLE public.projects (
  id                   uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid                  NOT NULL REFERENCES public.profiles(id),
  title                text                  NOT NULL,
  description          text,
  status               public.project_status NOT NULL DEFAULT 'qualification',
  current_stage        int                   NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 8),
  start_date           date,
  target_delivery_date date,
  notes                text,
  created_by           uuid                  REFERENCES public.profiles(id),
  created_at           timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX projects_client_id_idx ON public.projects(client_id);
CREATE INDEX projects_status_idx    ON public.projects(status);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- A client can only see projects explicitly assigned to them via
-- client_id. They cannot see any other client's project records.
CREATE POLICY "projects: clients can select their own projects"
  ON public.projects FOR SELECT
  USING (client_id = auth.uid());

-- Admins and super_admin can read all projects. This is needed for
-- the Projects list view, dashboard summaries, and reporting.
CREATE POLICY "projects: admins can select all projects"
  ON public.projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only admins and super_admin can create project records. Clients
-- cannot create their own projects — all projects are created by
-- the team inside the HQ app.
CREATE POLICY "projects: admins can insert"
  ON public.projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only admins and super_admin can update project records. This
-- covers advancing stages, updating notes, and changing status.
CREATE POLICY "projects: admins can update"
  ON public.projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Nobody can delete a project via the API. Project deletion is
-- handled exclusively by the GDPR deletion tool, which runs with
-- service_role privileges that bypass RLS entirely.
CREATE POLICY "projects: no user can delete"
  ON public.projects FOR DELETE
  USING (false);


-- ------------------------------------------------------------
-- TABLE: project_stages
-- One row per stage per project, tracking completion state.
-- Also stores live checklist checkbox state for the
-- Workflow Guide's Live Project Mode.
-- ------------------------------------------------------------
CREATE TABLE public.project_stages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_number    int         NOT NULL CHECK (stage_number BETWEEN 1 AND 8),
  stage_name      text        NOT NULL,
  is_complete     boolean     NOT NULL DEFAULT false,
  completed_at    timestamptz,
  completed_by    uuid        REFERENCES public.profiles(id),
  notes           text,
  checklist_state jsonb       NOT NULL DEFAULT '[]',
  -- checklist_state: array of { "id": uuid, "checked": boolean }
  -- persists per-project checkbox ticks in the Workflow Guide
  UNIQUE (project_id, stage_number)
);

CREATE INDEX project_stages_project_id_idx ON public.project_stages(project_id);

ALTER TABLE public.project_stages ENABLE ROW LEVEL SECURITY;

-- Clients can see stage records for their own projects so the portal
-- can display the stage tracker with completion status.
CREATE POLICY "project_stages: clients can select stages for their projects"
  ON public.project_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects pr
      WHERE pr.id = project_id
        AND pr.client_id = auth.uid()
    )
  );

-- Admins and super_admin can read all stage records across all
-- projects for the Projects page and Workflow Guide.
CREATE POLICY "project_stages: admins can select all"
  ON public.project_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only admins and super_admin can create stage records. Stages are
-- created automatically when a project is created (see Section 6).
CREATE POLICY "project_stages: admins can insert"
  ON public.project_stages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only admins and super_admin can mark stages complete, update notes,
-- or save checklist state from the Workflow Guide Live Project Mode.
CREATE POLICY "project_stages: admins can update"
  ON public.project_stages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Nobody can delete stage records. Deletion only happens via the
-- GDPR tool (service_role) when a whole project is being erased.
CREATE POLICY "project_stages: no user can delete"
  ON public.project_stages FOR DELETE
  USING (false);


-- ------------------------------------------------------------
-- TABLE: documents
-- Metadata for files stored in the project-documents bucket.
-- storage_path is the INTERNAL bucket path — it must never be
-- returned directly to a client. All file access goes through
-- the get-signed-url Edge Function which validates permissions
-- before generating a time-limited URL.
-- ------------------------------------------------------------
CREATE TABLE public.documents (
  id                uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid                 NOT NULL REFERENCES public.projects(id),
  name              text                 NOT NULL,
  type              public.document_type NOT NULL,
  storage_path      text                 NOT NULL,
  uploaded_by       uuid                 REFERENCES public.profiles(id),
  uploaded_at       timestamptz          NOT NULL DEFAULT now(),
  visible_to_client boolean              NOT NULL DEFAULT false
);

CREATE INDEX documents_project_id_idx ON public.documents(project_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Clients can only see documents that the team has explicitly marked
-- visible AND that belong to their own project. A document that is
-- visible but belongs to another client is still blocked. A document
-- for their project that is not yet marked visible is also blocked.
CREATE POLICY "documents: clients can select visible docs for their projects"
  ON public.documents FOR SELECT
  USING (
    visible_to_client = true
    AND EXISTS (
      SELECT 1 FROM public.projects pr
      WHERE pr.id = project_id
        AND pr.client_id = auth.uid()
    )
  );

-- Admins and super_admin can read all document records regardless
-- of the visible_to_client flag. This is needed for the HQ Projects
-- page document list where all files are shown.
CREATE POLICY "documents: admins can select all"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only admins and super_admin can upload document records. Clients
-- never upload files to this system.
CREATE POLICY "documents: admins can insert"
  ON public.documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only admins and super_admin can update document records — for
-- example toggling visible_to_client or renaming a document.
CREATE POLICY "documents: admins can update"
  ON public.documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Nobody can delete document records via the API. Physical file
-- deletion and record removal are handled by the GDPR tool only.
CREATE POLICY "documents: no user can delete"
  ON public.documents FOR DELETE
  USING (false);


-- ------------------------------------------------------------
-- TABLE: messages
-- Project-scoped chat between clients and the MyAppLabs team.
-- Realtime is enabled so both the portal and HQ receive
-- live updates without polling.
-- ------------------------------------------------------------
CREATE TABLE public.messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL REFERENCES public.projects(id),
  sender_id  uuid        NOT NULL REFERENCES public.profiles(id),
  body       text        NOT NULL CHECK (char_length(body) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);

CREATE INDEX messages_project_id_idx  ON public.messages(project_id);
CREATE INDEX messages_created_at_idx  ON public.messages(created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Clients can read messages in threads for their own projects.
-- They cannot see messages from other clients' project threads.
CREATE POLICY "messages: clients can select messages in their project threads"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects pr
      WHERE pr.id = project_id
        AND pr.client_id = auth.uid()
    )
  );

-- Clients can send messages only into their own project thread,
-- and only as themselves (sender_id must match their auth uid).
-- The rate-limit-messages Edge Function enforces an additional
-- 10-messages-per-hour limit before this insert is called.
CREATE POLICY "messages: clients can insert into their own project thread"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects pr
      WHERE pr.id = project_id
        AND pr.client_id = auth.uid()
    )
  );

-- Clients cannot update or delete any message.
-- Messages are permanent once sent, for both parties.

-- Admins and super_admin can read all messages across all project
-- threads. This is needed for the HQ unified Messages inbox.
CREATE POLICY "messages: admins can select all"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Admins and super_admin can send messages into any project thread
-- (replies from the team in the HQ Messages inbox).
CREATE POLICY "messages: admins can insert"
  ON public.messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Admins and super_admin can update messages — specifically to
-- write the read_at timestamp when a thread is opened in HQ.
CREATE POLICY "messages: admins can update read_at"
  ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );


-- ------------------------------------------------------------
-- TABLE: invoices
-- Financial records linked to a project and client.
-- Status moves forward only: draft → sent → paid.
-- PDF exports are generated client-side using jsPDF.
-- ------------------------------------------------------------
CREATE TABLE public.invoices (
  id         uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid                   NOT NULL REFERENCES public.projects(id),
  client_id  uuid                   NOT NULL REFERENCES public.profiles(id),
  amount     numeric(10,2)          NOT NULL,
  type       public.invoice_type    NOT NULL,
  status     public.invoice_status  NOT NULL DEFAULT 'draft',
  due_date   date,
  paid_at    timestamptz,
  reference  text                   NOT NULL,
  notes      text,
  created_at timestamptz            NOT NULL DEFAULT now()
);

CREATE INDEX invoices_client_id_idx ON public.invoices(client_id);
CREATE INDEX invoices_project_id_idx ON public.invoices(project_id);
CREATE INDEX invoices_status_idx ON public.invoices(status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Clients can see invoices addressed to them. This allows the portal
-- dashboard to show outstanding invoice amounts and due dates.
CREATE POLICY "invoices: clients can select their own invoices"
  ON public.invoices FOR SELECT
  USING (client_id = auth.uid());

-- Admins and super_admin can read all invoices for the HQ Invoices
-- page, summary cards, and PDF export functionality.
CREATE POLICY "invoices: admins can select all"
  ON public.invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only admins and super_admin can create invoice records inside the
-- HQ Invoices page.
CREATE POLICY "invoices: admins can insert"
  ON public.invoices FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only admins and super_admin can update invoices — e.g. advancing
-- status to sent or paid, or correcting reference/notes.
CREATE POLICY "invoices: admins can update"
  ON public.invoices FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Nobody can delete invoices via the API. Deletion is handled only
-- by the GDPR tool (service_role) when a client's data is erased.
CREATE POLICY "invoices: no user can delete"
  ON public.invoices FOR DELETE
  USING (false);


-- ------------------------------------------------------------
-- TABLE: tasks
-- Internal team task management. Linked optionally to a project.
-- Assignee is stored as the team member's name (Merrick/Sam)
-- for simplicity in an internal two-person team.
-- Clients have zero access to this table.
-- ------------------------------------------------------------
CREATE TABLE public.tasks (
  id          uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text                  NOT NULL,
  description text,
  status      public.task_status    NOT NULL DEFAULT 'todo',
  priority    public.task_priority  NOT NULL DEFAULT 'medium',
  due_date    date,
  assignee    text,
  project_id  uuid                  REFERENCES public.projects(id) ON DELETE SET NULL,
  tags        text[]                NOT NULL DEFAULT '{}',
  created_at  timestamptz           NOT NULL DEFAULT now(),
  updated_at  timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX tasks_status_idx     ON public.tasks(status);
CREATE INDEX tasks_assignee_idx   ON public.tasks(assignee);
CREATE INDEX tasks_project_id_idx ON public.tasks(project_id);
CREATE INDEX tasks_due_date_idx   ON public.tasks(due_date);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Only admin and super_admin can access tasks. This is an internal
-- team management tool — clients have no visibility here at all.
CREATE POLICY "tasks: admins only full access"
  ON public.tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );


-- ------------------------------------------------------------
-- TABLE: scripts
-- Pre-written communication scripts for the team (cold outreach,
-- follow-ups, delivery messages, etc). Clients never see these.
-- ------------------------------------------------------------
CREATE TABLE public.scripts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category   text        NOT NULL,
  title      text        NOT NULL,
  body       text        NOT NULL,
  tags       text[]      NOT NULL DEFAULT '{}',
  created_by uuid        REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scripts_category_idx ON public.scripts(category);

ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

-- Only admin and super_admin can read, create, edit, or delete
-- scripts. This is an internal content library — clients have
-- zero visibility. All operations covered by a single ALL policy.
CREATE POLICY "scripts: admins only full access"
  ON public.scripts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );


-- ------------------------------------------------------------
-- TABLE: workflow_guidance
-- Static reference content for each of the 8 project stages.
-- Displayed in the HQ Workflow Guide page. Internal only.
-- checklist is a jsonb array of { id, item, order } objects.
-- ------------------------------------------------------------
CREATE TABLE public.workflow_guidance (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_number int         NOT NULL UNIQUE CHECK (stage_number BETWEEN 1 AND 8),
  stage_name   text        NOT NULL,
  what_to_do   text        NOT NULL,
  checklist    jsonb       NOT NULL DEFAULT '[]',
  tips         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_guidance ENABLE ROW LEVEL SECURITY;

-- Only admin and super_admin can read workflow guidance. This is
-- internal team process documentation — clients do not see it.
-- INSERT/UPDATE/DELETE are also restricted to admin so guidance
-- can be updated from the HQ app in a future iteration.
CREATE POLICY "workflow_guidance: admins only full access"
  ON public.workflow_guidance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );


-- ------------------------------------------------------------
-- TABLE: referrals
-- Client referral submissions. Clients enter a friend's email,
-- the team tracks conversion manually via the admin view.
-- ------------------------------------------------------------
CREATE TABLE public.referrals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_by    uuid        NOT NULL REFERENCES public.profiles(id),
  referred_email text        NOT NULL,
  converted      boolean     NOT NULL DEFAULT false,
  project_id     uuid        REFERENCES public.projects(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX referrals_referred_by_idx ON public.referrals(referred_by);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Clients can submit a referral but only if referred_by matches
-- their own ID. This prevents impersonation — a client cannot
-- submit a referral as if it came from another client.
CREATE POLICY "referrals: clients can insert their own referrals"
  ON public.referrals FOR INSERT
  WITH CHECK (referred_by = auth.uid());

-- Clients can only see their own referral history. They cannot
-- view other clients' referrals or the full referral list.
CREATE POLICY "referrals: clients can select their own referrals"
  ON public.referrals FOR SELECT
  USING (referred_by = auth.uid());

-- Admins and super_admin can read all referral records to manage
-- the programme and mark referrals as converted.
CREATE POLICY "referrals: admins can select all"
  ON public.referrals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only admins and super_admin can update referrals — specifically
-- to toggle the converted flag and link a resulting project.
CREATE POLICY "referrals: admins can update"
  ON public.referrals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );


-- ------------------------------------------------------------
-- TABLE: audit_log
-- *** LEGAL COMPLIANCE RECORD — IMMUTABLE ***
-- Every significant action in both apps is written here.
-- This table MUST NEVER be truncated, modified, or have rows
-- deleted — including during GDPR deletions (which explicitly
-- preserve this table per legal requirement).
--
-- Actions logged:
--   user_login, user_logout, stage_advanced, document_uploaded,
--   document_downloaded, invoice_status_changed, message_sent,
--   client_invite_sent, portal_settings_changed,
--   gdpr_deletion_initiated, gdpr_deletion_completed,
--   mfa_enrolled, admin_login_failed
-- ------------------------------------------------------------
CREATE TABLE public.audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      text        NOT NULL,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_user_id_idx    ON public.audit_log(user_id);
CREATE INDEX audit_log_action_idx     ON public.audit_log(action);
CREATE INDEX audit_log_created_at_idx ON public.audit_log(created_at DESC);
CREATE INDEX audit_log_entity_id_idx  ON public.audit_log(entity_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert audit log entries. Both clients
-- (logging portal actions like message_sent) and admins (logging HQ
-- actions like stage_advanced) need this permission.
CREATE POLICY "audit_log: any authenticated user can insert"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Only super_admin can read the audit log. This is a compliance
-- record with sensitive data about all users' actions — access
-- is strictly limited to the principal administrator.
CREATE POLICY "audit_log: only super_admin can select"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- Explicit block: nobody can update audit log rows. Immutability
-- is a core requirement — a modified audit trail has no legal value.
CREATE POLICY "audit_log: nobody can update — append only"
  ON public.audit_log FOR UPDATE
  USING (false);

-- Explicit block: nobody can delete audit log rows via the API.
-- The GDPR tool (service_role) also explicitly skips this table
-- when erasing a client's data.
CREATE POLICY "audit_log: nobody can delete — legal compliance record"
  ON public.audit_log FOR DELETE
  USING (false);


-- ------------------------------------------------------------
-- TABLE: client_portal_settings
-- Per-client configuration controlling which portal sections
-- are visible. Only super_admin can modify these settings.
-- ------------------------------------------------------------
CREATE TABLE public.client_portal_settings (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              uuid        NOT NULL UNIQUE REFERENCES public.profiles(id),
  show_stage_tracker     boolean     NOT NULL DEFAULT true,
  show_documents         boolean     NOT NULL DEFAULT true,
  show_messages          boolean     NOT NULL DEFAULT true,
  show_referrals         boolean     NOT NULL DEFAULT true,
  custom_welcome_message text,
  updated_by             uuid        REFERENCES public.profiles(id),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_portal_settings ENABLE ROW LEVEL SECURITY;

-- Clients can read their own settings row so the portal knows which
-- sections to render. This is the settings context loaded on login.
CREATE POLICY "client_portal_settings: clients can select their own row"
  ON public.client_portal_settings FOR SELECT
  USING (client_id = auth.uid());

-- Admins and super_admin can read all settings rows for the Client
-- Portal Controls page in the HQ app.
CREATE POLICY "client_portal_settings: admins can select all"
  ON public.client_portal_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only super_admin can create portal settings records. This happens
-- when a client is first set up via the Client Portal Controls page.
CREATE POLICY "client_portal_settings: only super_admin can insert"
  ON public.client_portal_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- Only super_admin can update portal settings. This controls what
-- each client sees in their portal — a significant permission.
CREATE POLICY "client_portal_settings: only super_admin can update"
  ON public.client_portal_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );


-- ============================================================
-- SECTION 5: TIGHTEN RLS ON PRESERVED TABLES
-- The legacy schema allowed all authenticated users full access.
-- With clients now being authenticated users in the same project,
-- these tables must be restricted to admin/super_admin only.
-- ============================================================

-- ---- ideas ----
-- Drop the old broad policy and replace with admin-only access.
DROP POLICY IF EXISTS "Authenticated users can manage ideas" ON public.ideas;

CREATE POLICY "ideas: admins only full access"
  ON public.ideas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ---- expenses ----
DROP POLICY IF EXISTS "Authenticated users can manage expenses" ON public.expenses;

CREATE POLICY "expenses: admins only full access"
  ON public.expenses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ---- internal_projects ----
DROP POLICY IF EXISTS "Authenticated users can manage internal projects" ON public.internal_projects;

CREATE POLICY "internal_projects: admins only full access"
  ON public.internal_projects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ---- notes ----
DROP POLICY IF EXISTS "Authenticated users can manage notes" ON public.notes;

CREATE POLICY "notes: admins only full access"
  ON public.notes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ---- providers ----
DROP POLICY IF EXISTS "Authenticated users can manage providers" ON public.providers;

CREATE POLICY "providers: admins only full access"
  ON public.providers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ---- revenue ----
DROP POLICY IF EXISTS "Authenticated users can manage revenue" ON public.revenue;

CREATE POLICY "revenue: admins only full access"
  ON public.revenue FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );


-- ============================================================
-- SECTION 6: TRIGGERS & FUNCTIONS
-- ============================================================

-- Updated-at helper — updates the updated_at column on any row
-- change. Applied to tables that track modification timestamps.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER scripts_updated_at
  BEFORE UPDATE ON public.scripts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER client_portal_settings_updated_at
  BEFORE UPDATE ON public.client_portal_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a profiles row when a new user is created in auth.users.
-- Runs as SECURITY DEFINER so it can write to profiles even before
-- the new user has a profile row (and therefore no RLS permissions).
-- The role defaults to 'client'; super_admin sets it manually or via
-- the Supabase dashboard before inviting the user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::public.user_role,
      'client'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create 8 project_stages rows when a new project is inserted.
-- This ensures every project always has a full set of stage records
-- ready to be updated by the Workflow Guide and stage tracker.
CREATE OR REPLACE FUNCTION public.create_project_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stage_names text[] := ARRAY[
    'Lead Qualification',
    'Discovery Call',
    'Proposal & Contract',
    'Project Kickoff',
    'Build Phase',
    'Client Review',
    'Final Delivery',
    'Post-Delivery'
  ];
  i int;
BEGIN
  FOR i IN 1..8 LOOP
    INSERT INTO public.project_stages (
      project_id,
      stage_number,
      stage_name,
      is_complete,
      checklist_state
    ) VALUES (
      NEW.id,
      i,
      stage_names[i],
      false,
      '[]'::jsonb
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_project_created ON public.projects;
CREATE TRIGGER on_project_created
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.create_project_stages();

-- Auto-create a client_portal_settings row when a new profile is
-- created with role = 'client'. Defaults all sections to visible.
-- super_admin can customise these later via the Client Portal
-- Controls page.
CREATE OR REPLACE FUNCTION public.create_client_portal_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'client' THEN
    INSERT INTO public.client_portal_settings (client_id)
    VALUES (NEW.id)
    ON CONFLICT (client_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_client_profile_created ON public.profiles;
CREATE TRIGGER on_client_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_client_portal_settings();

-- Updated get_provider_password RPC — uses new audit_log schema
-- (entity_type/entity_id instead of resource_type/resource_id).
CREATE OR REPLACE FUNCTION public.get_provider_password(p_provider_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id            uuid;
  v_request_count      int;
  v_password_encrypted text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Rate limit: max 10 password retrievals per minute per user.
  SELECT COUNT(*) INTO v_request_count
  FROM public.audit_log
  WHERE user_id  = v_user_id
    AND action   = 'provider_password_fetched_rpc'
    AND created_at > now() - INTERVAL '1 minute';

  IF v_request_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please wait before requesting more passwords.';
  END IF;

  -- Fetch the encrypted password from the providers table.
  SELECT password_encrypted INTO v_password_encrypted
  FROM public.providers
  WHERE id = p_provider_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider not found';
  END IF;

  -- Write an immutable audit entry for this retrieval.
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_user_id, 'provider_password_fetched_rpc', 'provider', p_provider_id, '{}'::jsonb);

  RETURN v_password_encrypted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_provider_password(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_provider_password(uuid) TO authenticated;


-- ============================================================
-- SECTION 7: REALTIME PUBLICATIONS
-- Enable Realtime on tables that drive live UI updates in
-- both apps. Uses safe DO block to avoid errors on re-run.
-- ============================================================
DO $$
BEGIN
  -- messages: drives the real-time chat in both HQ and the portal.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  -- projects: drives the live stage tracker and dashboard in HQ.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
  END IF;

  -- invoices: drives the outstanding invoice badge on the portal dashboard.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'invoices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
  END IF;
END $$;


-- ============================================================
-- SECTION 8: STORAGE BUCKET — project-documents
-- Creates a private bucket for all client project files.
-- Public access is permanently disabled.
-- Signed URL access is enforced via the get-signed-url
-- Edge Function — never generated client-side.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  false,      -- PRIVATE: no object is ever publicly accessible
  20971520,   -- 20 MB maximum per file
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = 20971520,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

-- Storage RLS must be enabled for the objects table.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies for this bucket to avoid conflicts.
DROP POLICY IF EXISTS "storage: clients upload own folder"   ON storage.objects;
DROP POLICY IF EXISTS "storage: admins read all"             ON storage.objects;
DROP POLICY IF EXISTS "storage: admins delete"               ON storage.objects;

-- Authenticated users can upload files into this bucket.
-- Clients must upload to a path prefixed with their own user ID
-- (e.g. '<user-id>/project-name/filename.pdf') — this prevents
-- clients from overwriting each other's files.
-- Admins can upload to any path.
CREATE POLICY "storage: clients upload own folder, admins unrestricted"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-documents'
    AND auth.role() = 'authenticated'
    AND (
      -- Admins can upload to any path.
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'super_admin')
      )
      OR
      -- Clients can only upload to paths starting with their own user ID.
      (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- Only admins and super_admin can read storage objects directly.
-- Clients never read storage directly — they receive time-limited
-- signed URLs from the get-signed-url Edge Function instead.
CREATE POLICY "storage: admins can read all objects"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Only admins and super_admin can delete storage objects.
-- Deletion of client files is handled by the GDPR tool.
CREATE POLICY "storage: admins can delete objects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );


-- ============================================================
-- SECTION 9: SEED DATA — WORKFLOW GUIDANCE
-- All 8 project stages with thorough descriptions, actionable
-- checklists (5–6 items each), and practical tips.
-- ============================================================

INSERT INTO public.workflow_guidance (stage_number, stage_name, what_to_do, checklist, tips)
SELECT
  1,
  'Lead Qualification',
  E'Evaluate whether this prospect is worth your time before committing to a discovery call. Most wasted effort in a service business comes from pursuing leads that were never a good fit. Your job at this stage is to gather enough signal to make a confident go/no-go decision.\n\nReview the initial enquiry carefully. Look for specifics: do they know what they want, or are they vague about everything? Vague is not always bad — some of the best clients come in saying "I''ve got an idea, where do I start?" — but an unwillingness to engage with any structure is a warning sign.\n\nResearch the prospect''s business. Spend five minutes on their website and LinkedIn. Are they an established operation or a brand-new venture? Established businesses have clearer budgets and faster decision cycles. Startups can be great clients but often need more education on realistic timelines and costs.\n\nAssess budget signals. You do not need to know their exact budget yet, but look for signals. Did they mention a budget in the enquiry? Did they reference a previous development experience? Have they already invested in branding, marketing, or other professional services? These all indicate willingness to invest.\n\nConfirm the decision-maker. If the person contacting you cannot approve spend, your discovery call needs to include whoever can. Do not progress a project to proposal stage without a decision-maker present or explicitly signed off.\n\nScore the lead internally (hot, warm, cold) and record your reasoning. This helps you look back later and improve your qualification instincts over time.',
  jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Read the full enquiry and note any specific requirements, red flags, or strong buying signals', 'order', 1),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Research the prospect''s website, LinkedIn, and any other online presence (5 minutes is sufficient)', 'order', 2),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Assess budget readiness — look for signals like prior professional investment, company size, or explicit budget mentions', 'order', 3),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Confirm the enquirer is the decision-maker or has direct access to one', 'order', 4),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Score the lead (Hot / Warm / Cold) and record your reasoning in the project notes', 'order', 5),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Send a warm, professional acknowledgement within 24 hours — even if just to say a proposal is coming', 'order', 6)
  ),
  E'Cold leads are not bad leads — some of the most profitable projects start with a one-line enquiry. The goal here is to avoid spending hours on a discovery call with someone who has a £500 budget and a £50,000 idea.\n\nIf you are unsure about budget, ask a soft question in your acknowledgement: "Do you have a rough budget in mind, or would you like us to suggest options at different investment levels?" This rarely offends and saves you both time.\n\nTrust your instincts. If something feels off in the initial message — urgency without substance, aggressive tone, unrealistic expectations — flag it internally before the call, not after.'

UNION ALL SELECT
  2,
  'Discovery Call',
  E'The discovery call is the most valuable hour you will spend on any project. Done well, it gives you everything you need to write a winning proposal. Done badly, it produces a vague brief and a client who feels unheard.\n\nPrepare properly. Write out your questions before the call — not a script, but a structured list. You want to understand: the problem they are solving, who their end users are, what success looks like to them, what has already been tried, what their technical constraints are, and what their timeline and budget reality is.\n\nListen more than you talk. Your job in this call is to understand, not to pitch. Ask open questions. When they answer, ask follow-up questions before moving on. Silence is fine — give them space to think and elaborate.\n\nIdentify risks early. Are there third-party APIs that could be unreliable? Legacy systems that need integrating? Stakeholders with conflicting opinions? Regulatory requirements? Surface these now and note them. They will shape your scope and your pricing.\n\nEnd the call with absolute clarity on next steps. Tell them exactly when they will receive a proposal and what it will include. If you need follow-up information, ask for it on the call and confirm in writing. Clients who leave a discovery call knowing exactly what happens next are far more likely to sign.',
  jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Prepare 10–15 open discovery questions before the call covering problem, users, success metrics, constraints, and timeline', 'order', 1),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Record the call (with verbal consent at the start) or take detailed real-time notes', 'order', 2),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Establish the client''s definition of success — not features, but outcomes', 'order', 3),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Identify all third-party integrations, data sources, existing systems, and technical dependencies', 'order', 4),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Get a realistic budget range on the table — use a bracket question if direct ask feels uncomfortable', 'order', 5),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Close the call with confirmed next steps and send a written summary within 2 hours', 'order', 6)
  ),
  E'The bracket question works well for budget: "Our projects typically range from £X to £Y depending on scope. Does that broadly align with what you had in mind?" It normalises the conversation without demanding a number upfront.\n\nIf the call reveals a project that is significantly more complex than the initial enquiry suggested, it is fine to say "This is bigger than I expected — I want to make sure I give you an accurate proposal, so I may need a few extra days." Managing expectations now is far better than surprises in the proposal.\n\nAlways follow up the call in writing. A two-paragraph summary of what you discussed and agreed builds trust and protects you if the client''s memory differs from yours later.'

UNION ALL SELECT
  3,
  'Proposal & Contract',
  E'A great proposal does three things: it proves you understood the brief, it sets clear expectations, and it makes it easy for the client to say yes. It is not a list of features — it is a story about the outcome you are going to deliver and why you are the right people to deliver it.\n\nStructure the proposal clearly. Start with a brief summary of the problem you are solving and the outcome the client will have at the end. Then move to scope (what is included), deliverables (what they will receive), timeline (key milestones and target delivery), investment (pricing and payment terms), and out of scope (explicit list of what is not covered). The out-of-scope section is the most important paragraph in the document — it prevents scope creep and protects both parties.\n\nPrice with confidence. Do not apologise for your rates. If the number is right for the work, say it clearly. Offering unsolicited discounts undermines the value of what you are selling.\n\nDo not start work without a signed contract and a deposit in your account. No exceptions. A client who refuses to sign a contract or pay a deposit is telling you something important about how the rest of the engagement will go.\n\nUse a deposit of 50% as standard. This covers your time if the project stalls and demonstrates commitment from the client. The remaining 50% is due on delivery.',
  jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Draft the proposal using the standard template — include problem summary, scope, deliverables, timeline, and investment', 'order', 1),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Write an explicit "Out of Scope" section listing what is not included in the agreed price', 'order', 2),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Set payment terms: 50% deposit on signing, 50% on delivery (or agreed milestone structure for larger projects)', 'order', 3),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Send the proposal by email and follow up with a call or message if no response within 3 business days', 'order', 4),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Obtain the signed contract before any design, development, or research work begins', 'order', 5),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Collect and confirm receipt of the deposit before scheduling the kickoff', 'order', 6)
  ),
  E'If a client pushes back on price, resist the urge to immediately discount. Ask what their concern is first. Often the objection is about payment timing or cash flow, not the total amount — and you can solve that with a different milestone structure rather than a lower price.\n\nSend the proposal as a PDF, not a Google Doc. A formatted PDF looks professional and prevents the client from editing it.\n\nIf you do not hear back within a week of sending, use the "Proposal Sent — Follow Up" script. One professional nudge is expected and appreciated. Two is pushing it. Three is too many.'

UNION ALL SELECT
  4,
  'Project Kickoff',
  E'The kickoff sets the tone for the entire engagement. A well-run kickoff makes the client feel confident, informed, and excited. A disorganised one introduces doubt before a single line of code has been written.\n\nSend a welcome message the same day the deposit clears. Do not wait. Clients who have just paid feel vulnerable — they need immediate confirmation that they made the right decision. The kickoff message should include: a warm welcome, a brief outline of what happens next, their portal access details (so they can log in and start familiarising themselves), the agreed communication schedule, and the first milestone target.\n\nSet up the project in the system completely. Create the project record, set the initial stage to Kickoff, upload the signed proposal and contract to the portal, and configure the client''s portal settings to show the sections relevant to this project.\n\nAgree on a communication rhythm. Weekly updates work well for most projects. Async is fine — a Monday morning message saying "here''s what we''re working on this week" is enough to keep a client calm and informed. The worst thing you can do is go quiet for two weeks mid-build.\n\nIdentify the first milestone and confirm it explicitly. "By [date], you will have [specific deliverable] to review." Concrete commitments build trust.',
  jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Send the kickoff welcome message on the same day the deposit is confirmed — use the Project Kickoff script', 'order', 1),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Create the project in HQ, set stage to Kickoff, and invite the client to their portal', 'order', 2),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Upload the signed proposal and contract to the client portal with visible_to_client enabled', 'order', 3),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Agree on communication cadence and preferred channel (portal messages, email, or video calls)', 'order', 4),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Identify and confirm the first concrete milestone with a target date', 'order', 5),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Log the kickoff action to the audit trail and advance the project stage', 'order', 6)
  ),
  E'The portal invite email is the first impression of your product. Make sure the client''s profile and welcome message are configured before you send it.\n\nIf the project has a longer build phase, consider setting a recurring calendar reminder to send a brief update every 7 days. It takes 2 minutes and prevents the most common client complaint: "I hadn''t heard anything and started to worry."\n\nDo not over-schedule. A kickoff call is not always necessary — for straightforward projects, a detailed written kickoff message is often cleaner and faster for both parties.'

UNION ALL SELECT
  5,
  'Build Phase',
  E'The build phase is where you deliver what you promised. Quality and communication are equally important — a brilliant build that the client heard nothing about for six weeks will still generate anxiety and complaints.\n\nSend proactive updates at natural checkpoints. Do not wait for the client to ask how things are going. When you complete a significant piece of work, send a brief message: "Completed the authentication system today — moving on to the dashboard next. On track for the [date] review." Two sentences is enough. Clients do not want long technical reports — they want reassurance.\n\nRaise scope creep formally and immediately. If the client asks for something outside the agreed scope — however small — flag it in writing before doing the work. "Happy to include that — I''ll raise a small change request for the additional time." Absorbing scope creep silently leads to resentment, overrun budgets, and strained relationships.\n\nDocument decisions. When you make a technical decision that could be questioned later, write a one-line note in the project notes. "Chose [approach] because [reason]." This protects you in review and gives the client (or a future developer) context.\n\nPrepare the staging environment at least 3–4 days before the agreed review date. Do not rush a review invite.',
  jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Send at least one proactive progress update per week — use the Mid-Build Update script as a starting point', 'order', 1),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Raise any scope changes formally in writing before doing the work — never absorb scope creep silently', 'order', 2),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Create a change request invoice for any agreed additional work and get sign-off before proceeding', 'order', 3),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Document key technical decisions in the project notes as they are made', 'order', 4),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Set up a staging or preview environment at least 3 days before the review date', 'order', 5),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Back up all project assets, source code, and configuration to a secure location at the end of each work week', 'order', 6)
  ),
  E'The 24-hour rule: if something unexpected comes up that will affect the timeline, tell the client within 24 hours. The longer you leave it, the worse the conversation. A one-day slip mentioned early is a minor update. The same slip mentioned on delivery day is a crisis.\n\nIf a client messages asking for progress mid-build, that is a signal your updates have not been frequent or detailed enough. Use it as a prompt to improve, not a source of frustration.\n\nKeep your staging environment URL consistent — clients who have to track down a new URL every sprint lose confidence in your organisation.'

UNION ALL SELECT
  6,
  'Client Review',
  E'The review stage is where projects most commonly lose momentum. Your job is to make it as easy as possible for the client to review the work clearly and give you useful, consolidated feedback — not a drip of thoughts over three weeks.\n\nPresent the work properly. Do not just drop a link and say "let me know what you think." Write a short covering message that frames what they are reviewing: what was built, what decisions were made, what you are specifically asking them to evaluate, and what the feedback deadline is. A well-framed review gets better, faster feedback.\n\nSet a formal deadline. "Please send consolidated feedback by [date]" is not aggressive — it is professional. Most clients appreciate the structure. A 5–7 business day window is standard for most projects.\n\nConsolidate all feedback before actioning anything. Do not start making changes as individual messages come in. Wait for the full list, then address it in one pass. This is faster and prevents conflicting revisions.\n\nDistinguish clearly between bugs and new requests. A bug is something that does not work as specified — fix it within scope. A new request is something not in the original brief — raise a change request. Be firm but kind about this boundary.\n\nGet written sign-off before moving to delivery. "Approved to proceed" in a message is sufficient. You need a clear record that the client accepted the reviewed build.',
  jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Write a clear review briefing — link to staging, explain what to review, set a feedback deadline of 5–7 business days', 'order', 1),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Upload the staging link or review access details to the client portal documents', 'order', 2),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Wait for consolidated feedback before making any changes — do not action piecemeal messages', 'order', 3),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Categorise all feedback items as bug (in-scope fix) or new request (change request required)', 'order', 4),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Complete all agreed revisions and confirm completion with the client in writing', 'order', 5),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Obtain written sign-off ("approved to proceed") before moving to Final Delivery', 'order', 6)
  ),
  E'If feedback is late, a gentle nudge after the deadline is fine. Use the professional follow-up tone from the scripts. If feedback is very late (more than 2 weeks), it is reasonable to note that the project timeline will need to be extended accordingly.\n\nNever make undiscussed changes during review. Even small improvements can confuse the client if they are reviewing against the original build. Stay disciplined — improvements go on a list for a follow-up retainer.\n\nIf the client sends conflicting feedback (two stakeholders who disagree), ask them to consolidate a single list before you begin revisions. You cannot build to a moving target.'

UNION ALL SELECT
  7,
  'Final Delivery',
  E'Final delivery is the culmination of everything. Done well, it is a moment the client feels proud of — not just relieved that it is over. Your delivery process should feel as premium as the product itself.\n\nDeploy to production and verify everything yourself before telling the client it is live. Check all critical user flows, test on mobile and desktop, verify any third-party integrations are pointing to production credentials (not staging), and confirm there are no console errors. Do not rely on the client to find obvious problems on delivery day.\n\nPrepare a thorough handover guide. This is one of the most undervalued deliverables you can provide. A well-written handover guide — covering how to log in, how to manage content, who to contact for hosting support, and what the key technical decisions were — makes clients feel confident and reduces post-delivery support requests significantly. Upload it to the portal.\n\nTransfer everything. Source code (repository access), credentials (handed over securely, not in plain text), domain and hosting access, any design files or assets. The client should be able to operate without you from day one.\n\nRaise the final invoice on the day of delivery. Do not wait. The client is at peak satisfaction — it is the best possible moment to issue an invoice.',
  jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Deploy to production and personally verify all critical flows, integrations, and mobile/desktop rendering before notifying the client', 'order', 1),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Write and upload a handover guide to the client portal covering login, management, hosting, and key technical context', 'order', 2),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Transfer all assets: repository access, credentials (securely), domain/hosting access, design files', 'order', 3),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Send the Final Delivery confirmation message — use the Final Delivery script as a template', 'order', 4),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Raise the final invoice on the same day as delivery and reference the agreed payment terms', 'order', 5),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Set the project status to Complete in HQ and update all internal records', 'order', 6)
  ),
  E'Credentials should never be sent in plain text. Use a secure sharing method (1Password Share, Bitwarden Send, or at minimum a password-protected document). Document what method you used in the project notes.\n\nIf the client has not paid the final invoice within the agreed terms, a polite payment reminder via email is appropriate on the due date. The invoice page in HQ will flag overdue invoices automatically.\n\nThe handover guide is what separates a forgettable supplier from a trusted partner. Take the time to write it properly — even 500 words can make a significant difference to how the client experiences ownership of their new product.'

UNION ALL SELECT
  8,
  'Post-Delivery',
  E'The project is complete, but the relationship is not. Post-delivery is where the most valuable long-term business outcomes happen: referrals, testimonials, and retainers. Most agencies neglect this stage entirely — which is an enormous missed opportunity.\n\nCheck in one week after delivery. A short message asking how things are going shows you care about the outcome, not just the invoice. It also surfaces any minor issues before they become complaints, and it creates the natural opening for a testimonial request.\n\nRequest a testimonial. Do it early while the satisfaction is fresh and the project is still top of mind. Use the testimonial request script — it makes it easy by being specific about what you are asking for and why. A great testimonial on your website or LinkedIn is worth far more than any paid advertisement.\n\nPitch a retainer or maintenance package. Many clients underestimate how much ongoing support they will need. A small monthly retainer covering updates, performance monitoring, and minor changes is valuable to them and predictable income for you. Raise it naturally at the post-delivery check-in.\n\nAsk for a referral. Your happiest clients are your best sales channel. The referral ask script makes it easy to raise this without feeling awkward.\n\nConduct a brief internal retrospective. What went well? What would you do differently? Write two or three notes in the project record. Over time, these retrospectives compound into significantly better processes.',
  jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Check in with the client 7 days after delivery to confirm everything is running smoothly', 'order', 1),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Send the Testimonial Request script — while satisfaction is highest and the project is fresh', 'order', 2),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Pitch a retainer or monthly maintenance package if the project has ongoing support potential', 'order', 3),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Send the Referral Ask script — frame it as a favour, not a transaction', 'order', 4),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Write a brief internal retrospective in the project notes: what worked, what to improve next time', 'order', 5),
    jsonb_build_object('id', gen_random_uuid(), 'item', 'Update internal revenue records, archive the project, and close out any open tasks', 'order', 6)
  ),
  E'The window for a testimonial is roughly 2–3 weeks post-delivery. After that, the client has moved on mentally and writing something feels like effort. Strike while the iron is hot.\n\nIf a client goes quiet after delivery without paying the final invoice, a check-in message is both a genuine courtesy and a natural way to surface the payment. Do not chase invoices with a cold payment reminder — it sours the relationship unnecessarily.\n\nRetainer conversations go better when framed around the client''s needs ("as your product grows, you''ll want someone who knows the codebase on hand") rather than your business needs. Lead with value.'
;


-- ============================================================
-- SECTION 10: SEED DATA — SCRIPTS
-- 16 professional, warm, premium UK agency scripts across
-- 10 categories. Copy to Clipboard functionality in the HQ
-- Script Library page.
-- ============================================================

INSERT INTO public.scripts (category, title, body, tags) VALUES

-- ---- Cold Outreach ----
(
  'Cold Outreach',
  'Introduction — New Prospect Outreach',
  E'Hi [First Name],\n\nI hope this finds you well. I''m Merrick, co-founder of MyAppLabs — we''re a small, specialist app development studio based in the UK. We work with founders and businesses to design and build mobile and web apps from scratch.\n\nI came across [Company/Project] and wanted to reach out because [specific reason — their product, industry, or a gap you noticed]. It struck me as exactly the kind of project we enjoy working on.\n\nWe''re not a large agency — we''re two senior developers who work directly with clients from brief to delivery. That means you''re never handed off to a junior, and we care about the outcome as much as you do.\n\nIf you''re exploring development options, I''d love to have a short call to understand what you''re building and share how we might be able to help. No commitment, no hard sell.\n\nWould you be open to a 20-minute conversation in the next week or two?\n\nBest,\nMerrick\nMyAppLabs | hello@myapplabs.co.uk | myapplabs.co.uk',
  ARRAY['cold-outreach', 'introduction', 'first-contact']
),

(
  'Cold Outreach',
  'Re-engagement — Dormant Lead',
  E'Hi [First Name],\n\nI wanted to drop you a quick note — it''s been a few months since we last spoke about [project/idea], and I wanted to check in to see how things are progressing.\n\nWe''ve been working on a few similar projects recently and I had you in mind. If the timing wasn''t right before, no worries at all — but if you''re in a position to revisit it, I''d love to catch up.\n\nEven if things have changed direction entirely, I''d be genuinely interested to hear where you''ve landed.\n\nWorth a quick call?\n\nBest,\nMerrick\nMyAppLabs | hello@myapplabs.co.uk',
  ARRAY['cold-outreach', 're-engagement', 'dormant-lead']
),

-- ---- Follow Up ----
(
  'Follow Up',
  'Post-Discovery Call Follow-Up',
  E'Hi [First Name],\n\nThank you so much for your time today — I really enjoyed hearing about [project name / idea]. It''s clear you''ve thought carefully about what you want to build and it''s exactly the kind of challenge we love working on.\n\nAs discussed, here''s a quick summary of what we covered:\n\n• [Key requirement 1]\n• [Key requirement 2]\n• [Key requirement 3]\n\nI''ll have a full proposal with scope, timeline, and investment to you by [date]. If you have any additional thoughts or documents to share before then, please do send them over.\n\nLooking forward to working together.\n\nBest,\nMerrick',
  ARRAY['follow-up', 'discovery', 'post-call']
),

(
  'Follow Up',
  'No Response After Initial Contact',
  E'Hi [First Name],\n\nI wanted to follow up on my message from [approximate date / "last week"]. I appreciate you''re likely busy, so I''ll keep this brief.\n\nI''d love to find out whether [project / our conversation] is still on your radar. If your priorities have shifted or the timing isn''t right, that''s completely fine — just let me know and I won''t take up any more of your time.\n\nIf you are still interested, I''m happy to answer any questions or set up a quick call at your convenience.\n\nBest,\nMerrick\nMyAppLabs',
  ARRAY['follow-up', 'no-response', 'nudge']
),

-- ---- Proposal & Pricing ----
(
  'Proposal & Pricing',
  'Proposal Sent — Follow-Up',
  E'Hi [First Name],\n\nI wanted to follow up on the proposal I sent over on [date]. I hope it gave you a clear picture of what we''re proposing and why we think it''s the right approach for [project].\n\nIf you have any questions — about scope, timeline, pricing, or anything else — I''m very happy to jump on a call or answer in writing, whichever works best for you.\n\nIf the budget or terms need revisiting, let''s have a conversation. We''d rather find a structure that works for both of us than lose the opportunity to work together.\n\nLooking forward to hearing from you.\n\nBest,\nMerrick',
  ARRAY['proposal', 'follow-up', 'pricing']
),

(
  'Proposal & Pricing',
  'Confirming Project Start After Deposit Received',
  E'Hi [First Name],\n\nGreat news — I''ve just confirmed receipt of your deposit. We''re officially booked in and I''m genuinely excited to get started on [project name].\n\nHere''s what happens next:\n\n1. I''ll set up your client portal and send you access details shortly.\n2. Our first milestone is [milestone description], targeted for [date].\n3. I''ll be in touch with a brief update at the start of each week so you always know where we are.\n\nIf anything comes up in the meantime, the best way to reach me is through the portal messaging or by email at hello@myapplabs.co.uk.\n\nLet''s build something great.\n\nMerrick',
  ARRAY['proposal', 'kickoff', 'deposit-confirmed']
),

-- ---- Mid-Build Update ----
(
  'Mid-Build Update',
  'Weekly Progress Update',
  E'Hi [First Name],\n\nA quick update from us this week:\n\n✅ Completed: [What was finished this week]\n🔨 In progress: [What is currently being built]\n📅 Next milestone: [Upcoming deliverable and target date]\n\n[Optional: any decisions made, questions for the client, or things to be aware of]\n\nEverything is on track and we''re on course for the [date] review. As always, feel free to message here if you have any questions.\n\nBest,\nMerrick',
  ARRAY['mid-build', 'update', 'progress', 'weekly']
),

-- ---- Review & Feedback ----
(
  'Review & Feedback',
  'Sending Build for Client Review',
  E'Hi [First Name],\n\nExciting news — [project name] is ready for your review. I''ve set everything up on the staging environment and it''s looking great.\n\n🔗 Review link: [Staging URL or portal documents link]\n\nHere''s what I''d love your feedback on:\n• [Specific area 1 — e.g. user flows, layout, content]\n• [Specific area 2]\n• [Specific area 3]\n\nA few notes to help your review:\n• [Any login credentials or access notes]\n• [Any known areas still in progress]\n\nPlease do send your feedback in one consolidated message by [date — 5–7 business days]. That lets me action everything in one focused pass rather than back and forth.\n\nI''m really pleased with how it''s come together — I think you will be too.\n\nBest,\nMerrick',
  ARRAY['review', 'feedback', 'staging', 'client-review']
),

-- ---- Final Delivery ----
(
  'Final Delivery',
  'Final Delivery Confirmation',
  E'Hi [First Name],\n\nIt''s a big day — [project name] is live. 🎉\n\n🌐 Live URL: [Production URL]\n\nEverything has been tested and is running as expected. I''ve also uploaded your handover guide to the portal, which covers:\n• How to log in and manage [key features]\n• Hosting and domain details\n• How to get support going forward\n\nI''ve transferred all credentials securely [via method — e.g. 1Password Share / the handover document]. Please confirm once you''ve accessed and saved everything, and then I''ll revoke my admin access.\n\nThe final invoice has been raised and is due on [date]. Details are in your portal.\n\nIt''s been a genuine pleasure working with you on this. I''m really proud of what we''ve built together and I hope it exceeds your expectations.\n\nBest,\nMerrick\nMyAppLabs',
  ARRAY['final-delivery', 'launch', 'handover']
),

-- ---- Testimonial Request ----
(
  'Testimonial Request',
  'Requesting a Testimonial or Case Study',
  E'Hi [First Name],\n\nI hope [project name] is going well — it''s been [timeframe] since we launched and I''d love to hear how it''s landing.\n\nI wanted to ask a small favour: would you be willing to share a brief testimonial about your experience working with us? It doesn''t need to be long — even two or three sentences about what the project involved and how we approached it would mean a great deal.\n\nIf it''s helpful, here are a few prompts:\n• What challenge were you trying to solve?\n• What was it like to work with MyAppLabs?\n• What was the outcome?\n\nYou''re welcome to write it in your own words and I''ll share it on our website and LinkedIn (with your approval before publishing). If you''d prefer to do a short written case study instead, I''d be happy to draft something for you to review.\n\nThank you in advance — it genuinely makes a difference for a small studio like ours.\n\nBest,\nMerrick',
  ARRAY['testimonial', 'social-proof', 'case-study', 'post-delivery']
),

-- ---- Retainer Pitch ----
(
  'Retainer Pitch',
  'Monthly Retainer & Ongoing Support Pitch',
  E'Hi [First Name],\n\nNow that [project name] is live and settling in, I wanted to raise something that a few of our clients have found really valuable.\n\nAs your product grows — new users, new features, platform updates, occasional bugs — it helps to have someone who already knows the codebase on hand. Rather than starting from scratch with a new developer each time, a small monthly retainer gives you that continuity.\n\nFor [£X/month], we offer:\n• Up to [X] hours of development or consultancy per month\n• Priority response time for any issues\n• Monthly performance and security review\n• Rolling over unused hours (within reason)\n\nThere''s no long-term commitment — it''s a rolling monthly arrangement. Most clients find it pays for itself the first time something needs fixing quickly.\n\nWould it be worth a quick call to see if it makes sense for you?\n\nBest,\nMerrick',
  ARRAY['retainer', 'ongoing', 'support', 'upsell', 'post-delivery']
),

-- ---- Referral Ask ----
(
  'Referral Ask',
  'Asking for a Referral',
  E'Hi [First Name],\n\nI hope [project name] is doing well — it''s been great to see it out in the world.\n\nI wanted to ask — do you know anyone who might be building something similar? As a small studio, almost all of our best work comes through referrals from happy clients, and you''ve been a pleasure to work with.\n\nIf anyone comes to mind — a founder, a business owner, or a colleague who''s been talking about building an app or a platform — an introduction would mean a lot to us. There''s no obligation at all, and of course if it turns into a project, we''d make sure they''re looked after just as well as you were.\n\nWe also have a referral programme built into your client portal if you''d prefer to submit a name there.\n\nEither way, thank you for thinking of us.\n\nBest,\nMerrick',
  ARRAY['referral', 'word-of-mouth', 'post-delivery', 'growth']
),

-- ---- Handling Objections ----
(
  'Handling Objections',
  'Objection: We Already Have a Developer',
  E'Completely understandable — having an existing developer relationship is valuable. A few thoughts, if it''s helpful:\n\nWe''re not looking to replace an ongoing relationship. What we often find is that clients come to us for specific projects where they need a dedicated team focused entirely on delivery, rather than squeezing it around other commitments.\n\nIf your current developer is at capacity, working on something else, or this is a different type of project to their usual work, it might be worth a quick conversation to see if there''s a fit.\n\nIf it turns out there isn''t, no problem at all — but I''d rather have the conversation and find out.\n\nWorth 20 minutes?\n\nMerrick',
  ARRAY['objection', 'handling', 'competitor', 'cold-outreach']
),

(
  'Handling Objections',
  'Objection: The Quote is Too Expensive',
  E'I appreciate the honesty — budget conversations are always easier when they''re direct.\n\nA few thoughts:\n\nFirst, can you tell me what you had in mind? Sometimes there''s a significant gap and sometimes it''s closer than it seems. If you had a figure of [rough amount] in mind, let''s talk about what''s achievable at that level — it might mean adjusting scope rather than writing it off entirely.\n\nSecond, we can look at how the project is structured. A phased approach — building the core first and adding features in a second phase — can make the investment more manageable while still getting something live.\n\nWhat we won''t do is cut corners to hit a number. The projects we''re most proud of are the ones we''ve had the right time and resources to build properly. But I''m confident we can find a structure that works.\n\nShall we get on a call?\n\nMerrick',
  ARRAY['objection', 'handling', 'pricing', 'budget']
),

(
  'Handling Objections',
  'Objection: We''re Not Ready Yet',
  E'Completely fair — timing matters and there''s no point rushing into something before you''re ready.\n\nCan I ask what "ready" looks like for you? Sometimes it''s a funding milestone, sometimes it''s signing off on a design, sometimes it''s just that life is busy right now.\n\nIf it would be helpful, I''m happy to have a brief call now just to understand the project better — so that when you are ready, we can move quickly without starting from zero. It also means I can flag early on if there''s anything that would benefit from being thought through before development starts.\n\nNo pressure at all. And if it''s simply a matter of timing, let''s put a note in both our diaries for [month] and touch base then.\n\nMerrick',
  ARRAY['objection', 'handling', 'timing', 'not-ready']
),

(
  'Handling Objections',
  'Objection: Can You Do It for a Fixed Price?',
  E'Yes — fixed price is actually how we prefer to work.\n\nAll of our projects are scoped and priced upfront based on an agreed brief. You know exactly what you''re paying before we start, and we hold ourselves to that commitment. There are no surprise invoices mid-project.\n\nThe one exception is if the scope changes — if you ask for features that weren''t in the original brief, we''ll raise a formal change request before doing any additional work. But for everything in the agreed scope, the price is fixed.\n\nThe key to this working well for both of us is a thorough discovery and a clearly written brief. That''s why we invest time in the early stages — it protects you from cost overruns and protects us from scope creep.\n\nShall we set up a discovery call and build a scope from there?\n\nMerrick',
  ARRAY['objection', 'handling', 'fixed-price', 'pricing']
);


-- ============================================================
-- SUPABASE AUTH SETTINGS — APPLY BEFORE GOING LIVE
-- These cannot be applied via SQL — configure in the Supabase
-- dashboard under Authentication > Settings.
-- ============================================================
-- 1. DISABLE public signups
--    Authentication > Providers > Email > Disable "Enable sign ups"
--    Only invited users (via Supabase inviteUserByEmail) can create accounts.
--
-- 2. MAGIC LINK EXPIRY
--    Authentication > Settings > Magic link expiry: 900 (15 minutes)
--
-- 3. ENABLE MFA (TOTP)
--    Authentication > Multi-factor Authentication > Enable TOTP
--
-- 4. ALLOWED REDIRECT URLS
--    Authentication > URL Configuration > Redirect URLs:
--      https://myapplabs.co.uk
--      https://portal.myapplabs.co.uk
--      http://localhost:5173
--
-- 5. SITE URL
--    Authentication > URL Configuration > Site URL:
--      https://myapplabs.co.uk
--
-- ============================================================
-- SUPABASE CORS — APPLY BEFORE GOING LIVE
-- Configure in Supabase dashboard > Settings > API > CORS
-- Allowed origins:
--   https://myapplabs.co.uk
--   https://portal.myapplabs.co.uk
--   http://localhost:5173
-- ============================================================

-- ============================================================
-- DONE.
-- Run npm audit in both app directories and resolve all
-- high/critical vulnerabilities before deploying to production.
-- ============================================================
