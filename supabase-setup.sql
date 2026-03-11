-- ============================================================
-- MyAppLabs HQ — Supabase SQL Setup Script
-- Run this in your Supabase project: SQL Editor → New Query
-- ============================================================

-- Enable UUID extension (usually already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  status      TEXT NOT NULL DEFAULT 'lead',   -- 'lead' | 'active' | 'completed'
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROJECTS  (linked to a client)
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
  client_name  TEXT,
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'in progress',  -- 'in progress' | 'review' | 'completed'
  deadline     DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_client_id_idx ON projects(client_id);

-- ============================================================
-- TASKS  (Kanban board)
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT NOT NULL,
  description  TEXT,
  "column"     TEXT NOT NULL DEFAULT 'todo',   -- 'todo' | 'inprogress' | 'done'
  priority     TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high'
  assigned_to  TEXT,
  due_date     DATE,
  tags         TEXT[],
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROMPTS  (Prompt Builder saved prompts)
-- ============================================================
CREATE TABLE IF NOT EXISTS prompts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  role              TEXT NOT NULL,
  goal              TEXT NOT NULL,
  context           TEXT,
  constraints       TEXT,
  output_format     TEXT,
  assembled_prompt  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REVENUE  (Income / financials)
-- ============================================================
CREATE TABLE IF NOT EXISTS revenue (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_name   TEXT,
  project_name  TEXT,
  amount        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'invoiced',  -- 'invoiced' | 'paid'
  date          DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- UPDATED_AT trigger function (auto-updates updated_at on row changes)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to each table
CREATE OR REPLACE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER prompts_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER revenue_updated_at
  BEFORE UPDATE ON revenue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable RLS but allow full access for authenticated users only
-- ============================================================
ALTER TABLE clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue  ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users have full CRUD access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='Authenticated users can manage clients') THEN
    CREATE POLICY "Authenticated users can manage clients" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Authenticated users can manage projects') THEN
    CREATE POLICY "Authenticated users can manage projects" ON projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tasks' AND policyname='Authenticated users can manage tasks') THEN
    CREATE POLICY "Authenticated users can manage tasks" ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prompts' AND policyname='Authenticated users can manage prompts') THEN
    CREATE POLICY "Authenticated users can manage prompts" ON prompts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='revenue' AND policyname='Authenticated users can manage revenue') THEN
    CREATE POLICY "Authenticated users can manage revenue" ON revenue FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ============================================================
-- REALTIME
-- Enable Realtime publication for all 5 tables
-- ============================================================
-- Check if already in publication, then add
DO $$
BEGIN
  -- clients
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'clients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE clients;
  END IF;

  -- projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE projects;
  END IF;

  -- tasks
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;

  -- prompts
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'prompts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE prompts;
  END IF;

  -- revenue
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'revenue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE revenue;
  END IF;
END $$;


-- ============================================================
-- IDEAS  (Ideas Pipeline — Kanban board)
-- ============================================================
CREATE TABLE IF NOT EXISTS ideas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  description       TEXT,
  platform          TEXT NOT NULL DEFAULT 'iOS',
  stage             TEXT NOT NULL DEFAULT 'concept',   -- 'concept' | 'validating' | 'building' | 'launched' | 'shelved'
  potential_revenue TEXT,
  app_store_link    TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- EXPENSES  (Business costs / subscriptions)
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'Other',    -- 'Software' | 'Hardware' | 'Marketing' | 'Services' | 'Office' | 'Other'
  amount      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  frequency   TEXT NOT NULL DEFAULT 'monthly',  -- 'monthly' | 'annual' | 'one-off'
  date        DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers
CREATE OR REPLACE TRIGGER ideas_updated_at
  BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE ideas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ideas' AND policyname='Authenticated users can manage ideas') THEN
    CREATE POLICY "Authenticated users can manage ideas" ON ideas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='expenses' AND policyname='Authenticated users can manage expenses') THEN
    CREATE POLICY "Authenticated users can manage expenses" ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ideas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ideas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'expenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
  END IF;
END $$;


-- ============================================================
-- INTERNAL PROJECTS  (Internal company projects — tooling, marketing, R&D etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS internal_projects (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  description    TEXT,
  category       TEXT DEFAULT 'tooling',    -- 'tooling' | 'marketing' | 'portfolio' | 'r_and_d' | 'learning' | 'admin'
  priority       TEXT DEFAULT 'medium',     -- 'low' | 'medium' | 'high'
  status         TEXT DEFAULT 'in progress',-- 'in progress' | 'review' | 'completed'
  deadline       DATE,
  notes          TEXT,
  workflow_stage TEXT DEFAULT 'discovery',  -- 'discovery' | 'design' | 'production' | 'quality_control' | 'packaged'
  resources      JSONB DEFAULT '[]',
  sub_projects   JSONB DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger
CREATE OR REPLACE TRIGGER internal_projects_updated_at
  BEFORE UPDATE ON internal_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE internal_projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='internal_projects' AND policyname='Authenticated users can manage internal projects') THEN
    CREATE POLICY "Authenticated users can manage internal projects" ON internal_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'internal_projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE internal_projects;
  END IF;
END $$;


-- ============================================================
-- NOTES  (Shared notes between partners)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL DEFAULT 'Untitled',
  content     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notes' AND policyname='Authenticated users can manage notes') THEN
    CREATE POLICY "Authenticated users can manage notes" ON notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notes;
  END IF;
END $$;


-- ============================================================
-- AUDIT_LOG  (Immutable audit trail — users can INSERT only)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   UUID,
  metadata      JSONB DEFAULT '{}'
);

-- No updated_at needed — audit entries are write-once

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Authenticated users can INSERT audit entries
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_log' AND policyname='Authenticated users can insert audit log') THEN
    CREATE POLICY "Authenticated users can insert audit log"
      ON audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Authenticated users can READ their own entries (useful for self-audit)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_log' AND policyname='Authenticated users can read audit log') THEN
    CREATE POLICY "Authenticated users can read audit log"
      ON audit_log FOR SELECT TO authenticated USING (true);
  END IF;

  -- NO UPDATE policy — audit logs are immutable
  -- NO DELETE policy — audit logs cannot be removed by users
END $$;


-- ============================================================
-- PROVIDERS  (Secure third-party service directory)
-- ============================================================
CREATE TABLE IF NOT EXISTS providers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name               TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT 'Other',
    -- 'Insurance' | 'Development' | 'Hosting' | 'Communication' | 'Finance' | 'Compliance' | 'Other'
  description        TEXT,
  url                TEXT,
  username           TEXT,
  password_encrypted TEXT,
    -- AES-256-GCM: stored as "base64(iv):base64(ciphertext):base64(authTag)"
    -- NEVER stored as plaintext — decrypted only in-memory on the client
    -- "PLACEHOLDER_NOT_ENCRYPTED" = no password set yet
  notes              TEXT,
  icon_url           TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  added_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS providers_category_idx ON providers(category);
CREATE INDEX IF NOT EXISTS providers_is_active_idx ON providers(is_active);

CREATE OR REPLACE TRIGGER providers_updated_at
  BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='providers' AND policyname='Authenticated users can manage providers') THEN
    CREATE POLICY "Authenticated users can manage providers"
      ON providers FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'providers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE providers;
  END IF;
END $$;


-- ============================================================
-- RPC: get_provider_password
-- Secure server-side retrieval of a single encrypted password.
-- Enforces:
--   1. Authentication required
--   2. Rate limit: max 10 requests per minute per user
--   3. Server-side audit log entry on every call
-- ============================================================
CREATE OR REPLACE FUNCTION get_provider_password(p_provider_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id            UUID;
  v_request_count      INT;
  v_password_encrypted TEXT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Rate limiting: max 10 password fetches per minute per user
  SELECT COUNT(*) INTO v_request_count
  FROM audit_log
  WHERE user_id = v_user_id
    AND action = 'provider_password_fetched_rpc'
    AND created_at > NOW() - INTERVAL '1 minute';

  IF v_request_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please wait before requesting more passwords.';
  END IF;

  -- Fetch the encrypted password
  SELECT password_encrypted INTO v_password_encrypted
  FROM providers
  WHERE id = p_provider_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider not found';
  END IF;

  -- Log this retrieval (server-side, immutable)
  INSERT INTO audit_log (user_id, action, resource_type, resource_id, metadata)
  VALUES (v_user_id, 'provider_password_fetched_rpc', 'provider', p_provider_id, '{}');

  RETURN v_password_encrypted;
END;
$$;

-- Grant execute to authenticated users only
REVOKE EXECUTE ON FUNCTION get_provider_password(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_provider_password(UUID) TO authenticated;


-- ============================================================
-- SEED DATA — Sample providers
-- password_encrypted = 'PLACEHOLDER_NOT_ENCRYPTED' (no real credentials)
-- added_by = NULL (no user context at seed time)
-- ============================================================
INSERT INTO providers (name, category, description, url, username, password_encrypted, sort_order)
SELECT name, category, description, url, username, 'PLACEHOLDER_NOT_ENCRYPTED', sort_order
FROM (VALUES
  ('Hiscox Insurance',      'Insurance',     'Business insurance portal',                     'https://www.hiscox.co.uk/my-account',    '',  1),
  ('Google Workspace',      'Communication', 'Business email and Google apps',                'https://admin.google.com',               '',  2),
  ('Supabase',              'Development',   'Database and auth backend',                     'https://app.supabase.com',               '',  3),
  ('Vercel',                'Hosting',       'Portfolio and demo deployment',                 'https://vercel.com/login',               '',  4),
  ('GitHub',                'Development',   'Code repositories',                             'https://github.com',                     '',  5),
  ('Netlify',               'Hosting',       'Additional static site hosting',                'https://app.netlify.com',                '',  6),
  ('Virgin Money Business', 'Finance',       'Business bank account',                         'https://www.virginmoney.com/business',   '',  7),
  ('UK Postbox',            'Communication', 'Virtual business address and mail handling',    'https://www.ukpostbox.com',              '',  8),
  ('Namecheap',             'Hosting',       'Domain registration for myapplabs.co.uk',       'https://www.namecheap.com',              '',  9),
  ('Stripe',                'Finance',       'Payment processing for app sales',              'https://dashboard.stripe.com',           '', 10),
  ('ICO',                   'Compliance',    'GDPR / data protection registration (UK)',      'https://ico.org.uk/about-the-ico/',      '', 11)
) AS t(name, category, description, url, username, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE providers.name = t.name);


-- ============================================================
-- DONE — v2 additions:
--   notes        table (was missing from original setup)
--   audit_log    table (immutable, INSERT-only for users)
--   providers    table (AES-256-GCM encrypted passwords)
--   get_provider_password() RPC (rate-limited, server-logged)
--   Seed data for 11 providers (placeholder passwords)
-- ============================================================
