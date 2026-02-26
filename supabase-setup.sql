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
-- DONE
-- All 7 tables created with:
--   ideas, expenses added
--   - UUID primary keys
--   - snake_case column names (app converts to/from camelCase)
--   - created_at / updated_at timestamps
--   - auto-update trigger on updated_at
--   - RLS enabled (authenticated users only)
--   - Realtime enabled
-- ============================================================
