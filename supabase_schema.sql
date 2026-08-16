-- ============================================================================
--  LungScan AI — Supabase Database Schema DDL & Non-Recursive RLS Policies
--  Run this in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor
-- ============================================================================

-- 1. Profiles Table (Stores Doctors, Patients, and Admins)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('doctor', 'patient', 'admin')),
  doctor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Assigned doctor for patients
  specialization TEXT DEFAULT 'Pulmonology',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for doctor patient lookups
CREATE INDEX IF NOT EXISTS idx_profiles_doctor_id ON public.profiles(doctor_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2. Scans Table (Stores Chest X-ray Predictions, Symptoms & Grad-CAM Heatmaps)
CREATE TABLE IF NOT EXISTS public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  image_url TEXT,
  gradcam_image TEXT,
  predicted_class TEXT NOT NULL,
  confidence FLOAT NOT NULL,
  top3_predictions JSONB,
  symptoms JSONB,
  risk_level TEXT NOT NULL,
  needs_human_review BOOLEAN DEFAULT FALSE,
  clinical_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure gradcam_image column exists for existing tables
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS gradcam_image TEXT;

-- Index for scans query
CREATE INDEX IF NOT EXISTS idx_scans_patient_id ON public.scans(patient_id);
CREATE INDEX IF NOT EXISTS idx_scans_doctor_id ON public.scans(doctor_id);

-- 3. Auto-Assignment Function & Trigger for Patients
CREATE OR REPLACE FUNCTION public.assign_patient_to_doctor()
RETURNS TRIGGER AS $$
DECLARE
  target_doctor_id UUID;
BEGIN
  IF NEW.role = 'patient' AND NEW.doctor_id IS NULL THEN
    -- Select doctor with fewest assigned patients who currently has < 15 patients
    SELECT d.id INTO target_doctor_id
    FROM public.profiles d
    LEFT JOIN public.profiles p ON p.doctor_id = d.id AND p.role = 'patient'
    WHERE d.role = 'doctor'
    GROUP BY d.id, d.created_at
    HAVING COUNT(p.id) < 15
    ORDER BY COUNT(p.id) ASC, d.created_at ASC
    LIMIT 1;

    IF target_doctor_id IS NOT NULL THEN
      NEW.doctor_id := target_doctor_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_assign_patient ON public.profiles;
CREATE TRIGGER trigger_assign_patient
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_patient_to_doctor();

-- 4. Trigger & Function when a NEW Doctor registers: auto-assign existing unassigned patients
CREATE OR REPLACE FUNCTION public.reassign_unassigned_patients()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'doctor' THEN
    UPDATE public.profiles
    SET doctor_id = NEW.id
    WHERE id IN (
      SELECT id FROM public.profiles
      WHERE role = 'patient' AND doctor_id IS NULL
      ORDER BY created_at ASC
      LIMIT 15
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_reassign_unassigned_patients ON public.profiles;
CREATE TRIGGER trigger_reassign_unassigned_patients
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.reassign_unassigned_patients();

-- 5. Helper Security Definer Functions to Avoid RLS Infinite Recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_my_doctor_id()
RETURNS UUID AS $$
DECLARE
  doc_id UUID;
BEGIN
  SELECT doctor_id INTO doc_id FROM public.profiles WHERE id = auth.uid();
  RETURN doc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

-- Clean up any legacy or recursive policies
-- Ensure doctor management columns exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_capacity INT DEFAULT 15;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Doctors can view assigned patients" ON public.profiles;
DROP POLICY IF EXISTS "Patients can view assigned doctor" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
DROP POLICY IF EXISTS "Profiles delete policy" ON public.profiles;

DROP POLICY IF EXISTS "Patients can view own scans" ON public.scans;
DROP POLICY IF EXISTS "Doctors can view assigned patients scans" ON public.scans;
DROP POLICY IF EXISTS "Admins can view all scans" ON public.scans;
DROP POLICY IF EXISTS "Scans select policy" ON public.scans;
DROP POLICY IF EXISTS "Patients can insert own scans" ON public.scans;
DROP POLICY IF EXISTS "Scans update policy" ON public.scans;
DROP POLICY IF EXISTS "Scans delete policy" ON public.scans;

-- ── Profiles Policies ─────────────────────────────────────────────────────

-- Users can view their own profile, assigned patients, assigned doctor, or if admin
CREATE POLICY "Profiles select policy"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id                       -- User viewing own profile
    OR auth.uid() = doctor_id             -- Doctor viewing assigned patient profile
    OR id = public.get_my_doctor_id()     -- Patient viewing assigned doctor profile
    OR public.is_admin()                  -- Admin viewing any profile
  );

-- Users can insert their own profile on signup
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update own profile, Admins can update any profile
CREATE POLICY "Profiles update policy"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin());

-- Admins can delete profiles
CREATE POLICY "Profiles delete policy"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- ── Scans Policies ────────────────────────────────────────────────────────

-- Patients can view own scans, Doctors can view assigned patients scans, Admins view all
CREATE POLICY "Scans select policy"
  ON public.scans FOR SELECT
  USING (
    auth.uid() = patient_id
    OR auth.uid() = doctor_id
    OR public.is_admin()
  );

-- Patients can insert their own scans
CREATE POLICY "Patients can insert own scans"
  ON public.scans FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

-- Admins can update scans
CREATE POLICY "Scans update policy"
  ON public.scans FOR UPDATE
  USING (public.is_admin());

-- Admins can delete scans
CREATE POLICY "Scans delete policy"
  ON public.scans FOR DELETE
  USING (public.is_admin());

-- ── 7. Auto-Promote Primary Admin (admin@example.com) ───────────────
CREATE OR REPLACE FUNCTION public.promote_primary_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email = 'admin@example.com' THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_promote_primary_admin ON public.profiles;
CREATE TRIGGER trigger_promote_primary_admin
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.promote_primary_admin();

-- Promote existing admin@example.com user if already in profiles
UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@example.com';

