-- ============================================================
-- MyAppLabs HQ — App Settings Migration
-- Run in Supabase SQL Editor AFTER supabase-migration-v2.sql
--
-- Adds the app_settings singleton table used by:
--   • The Settings panel (Business Info section)
--   • businessInfo.js / loadBusinessInfo() for invoice PDFs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  -- Singleton enforced by CHECK (id = 1).
  -- Always upsert with id = 1. Use .single() to read.
  id                     integer      PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Business identity
  company_name           text,
  companies_house_number text,
  ico_number             text         NOT NULL DEFAULT 'ZC104281',

  -- Registered office address
  address_line1          text,
  address_line2          text,
  address_city           text,
  address_postcode       text,
  address_country        text         NOT NULL DEFAULT 'England & Wales',

  -- Contact
  contact_email          text,
  website                text,

  -- Bank details (used in invoice payment instructions)
  bank_account_name      text,
  bank_sort_code         text,
  bank_account_number    text,

  -- VAT (optional — only needed if VAT registered)
  vat_number             text,

  -- Audit
  updated_at             timestamptz  NOT NULL DEFAULT now(),
  updated_by             uuid         REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Admin and super_admin can read business settings.
CREATE POLICY "app_settings: admins can select"
  ON public.app_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Admin and super_admin can insert (only happens once — the seed below).
CREATE POLICY "app_settings: admins can insert"
  ON public.app_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Admin and super_admin can update business settings.
CREATE POLICY "app_settings: admins can update"
  ON public.app_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Nobody can delete the settings row via the API.
CREATE POLICY "app_settings: no user can delete"
  ON public.app_settings FOR DELETE
  USING (false);

-- Seed the single row so .single() always returns data
-- rather than a "no rows" error before any admin has saved.
INSERT INTO public.app_settings (id, ico_number, address_country)
VALUES (1, 'ZC104281', 'England & Wales')
ON CONFLICT (id) DO NOTHING;
