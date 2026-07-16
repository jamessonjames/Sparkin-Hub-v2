-- Creative Flow Hub Unified SQL Schema
-- Generated on 2026-07-16T13:34:57.408Z

-- ==========================================
-- MIGRATION: 20260714213652_c22a30f8-cff6-421b-8d79-77bc47a4d2fc.sql
-- ==========================================

-- ENUMS
CREATE TYPE public.app_role AS ENUM ('owner','admin','collaborator');
CREATE TYPE public.billing_model AS ENUM ('fixed','credits');
CREATE TYPE public.fixed_type AS ENUM ('monthly','one_off');
CREATE TYPE public.demand_status AS ENUM ('rascunho','nao_iniciado','fazendo','para_analise','com_ajustes','concluido');
CREATE TYPE public.demand_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.note_type AS ENUM ('reuniao','briefing','ideias','copy','planejamento','observacoes');
CREATE TYPE public.note_visibility AS ENUM ('private','shared');

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT, email TEXT, avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  can_create_demands BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_team(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt INT; r public.app_role;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.user_roles;
  r := CASE WHEN cnt = 0 THEN 'owner'::public.app_role ELSE COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'collaborator') END;
  INSERT INTO public.profiles (id, name, email) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, r);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.work_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_types TO authenticated;
GRANT ALL ON public.work_types TO service_role;
ALTER TABLE public.work_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team work_types" ON public.work_types FOR ALL TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));
INSERT INTO public.work_types (name) VALUES ('Design Hub'),('Manutenção de site'),('Social Media Pack'),('UI/UX Design'),('Projeto único'),('Outros');

CREATE TABLE public.demand_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  default_credits INTEGER NOT NULL DEFAULT 0,
  per_slide BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_types TO authenticated;
GRANT ALL ON public.demand_types TO service_role;
ALTER TABLE public.demand_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team demand_types" ON public.demand_types FOR ALL TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));
INSERT INTO public.demand_types (name, default_credits, per_slide) VALUES
  ('Copy e briefing', 2, false),('Arte única', 3, false),('Carrossel', 5, false),
  ('Vídeo simples', 5, false),('PowerPoint', 1, true),('Catálogo', 4, false),
  ('Ajuste de etiqueta / embalagem', 4, false),('Etiqueta / embalagem nova', 8, false),
  ('Manutenção de site', 8, false),('Ajuste de site', 4, false),('Outro', 0, false);

CREATE TABLE public.credit_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_credits INTEGER NOT NULL,
  max_credits INTEGER,
  price NUMERIC(10,2) NOT NULL,
  extra_per_credit NUMERIC(10,2),
  sort_order INTEGER NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_tiers TO authenticated;
GRANT ALL ON public.credit_tiers TO service_role;
ALTER TABLE public.credit_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team credit_tiers" ON public.credit_tiers FOR ALL TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));
INSERT INTO public.credit_tiers (min_credits, max_credits, price, extra_per_credit, sort_order) VALUES
  (0,16,1000,NULL,1),(17,24,1400,NULL,2),(25,32,1800,NULL,3),(33,40,2200,NULL,4),(41,48,2400,NULL,5),(49,NULL,2400,70,6);

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT, email TEXT, phone TEXT,
  work_type_id UUID REFERENCES public.work_types(id),
  billing_model public.billing_model NOT NULL DEFAULT 'fixed',
  fixed_type public.fixed_type,
  monthly_value NUMERIC(10,2),
  commercial_notes TEXT,
  credits_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  slug TEXT NOT NULL UNIQUE,
  access_active BOOLEAN NOT NULL DEFAULT TRUE,
  require_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT,
  internal_notes TEXT,
  sort_order INTEGER,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team clients" ON public.clients FOR ALL TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));
CREATE TRIGGER touch_clients BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.demands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  demand_type_id UUID REFERENCES public.demand_types(id),
  status public.demand_status NOT NULL DEFAULT 'nao_iniciado',
  status_id UUID,
  priority public.demand_priority NOT NULL DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  reference_month DATE NOT NULL DEFAULT date_trunc('month', now())::date,
  estimated_credits INTEGER NOT NULL DEFAULT 0,
  estimated_hours NUMERIC DEFAULT 1.0,
  is_manually_scheduled BOOLEAN NOT NULL DEFAULT false,
  approved_credits INTEGER,
  assignee_user_id UUID REFERENCES auth.users(id),
  created_by_user_id UUID REFERENCES auth.users(id),
  created_by_client BOOLEAN NOT NULL DEFAULT FALSE,
  internal_notes TEXT,
  sort_order INTEGER,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demands TO authenticated;
GRANT ALL ON public.demands TO service_role;
ALTER TABLE public.demands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team demands" ON public.demands FOR ALL TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));
CREATE TRIGGER touch_demands BEFORE UPDATE ON public.demands FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_demands_client ON public.demands(client_id);
CREATE INDEX idx_demands_status ON public.demands(status);
CREATE INDEX idx_demands_ref_month ON public.demands(reference_month);

CREATE TABLE public.demand_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id UUID NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('team','client')),
  author_user_id UUID REFERENCES auth.users(id),
  author_label TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_comments TO authenticated;
GRANT ALL ON public.demand_comments TO service_role;
ALTER TABLE public.demand_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team comments" ON public.demand_comments FOR ALL TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));

CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note_type public.note_type NOT NULL DEFAULT 'observacoes',
  content TEXT,
  visibility public.note_visibility NOT NULL DEFAULT 'private',
  created_by_user_id UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team notes" ON public.notes FOR ALL TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));
CREATE TRIGGER touch_notes BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_notes_client ON public.notes(client_id);

CREATE TABLE public.client_sessions (
  token TEXT PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
GRANT SELECT, INSERT, DELETE ON public.client_sessions TO service_role;
ALTER TABLE public.client_sessions ENABLE ROW LEVEL SECURITY;

-- Políticas em storage.objects (buckets já criados via storage_create_bucket)
CREATE POLICY "read media buckets" ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('media','avatars','branding'));
CREATE POLICY "team write media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('media','avatars','branding') AND public.is_team(auth.uid()));
CREATE POLICY "team update media" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('media','avatars','branding') AND public.is_team(auth.uid()));
CREATE POLICY "team delete media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('media','avatars','branding') AND public.is_team(auth.uid()));

-- ==========================================
-- MIGRATION: 20260714213708_201c5018-3786-4a3a-8533-58e793e9a03c.sql
-- ==========================================

-- Fix search_path (touch_updated_at faltava SET search_path)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Revogar execução das SECURITY DEFINER (chamadas ficam só via triggers/policies internas)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- client_sessions: RLS ativa sem policies bloqueia authenticated. Adiciona policy explícita "nada" para clareza.
CREATE POLICY "no direct access" ON public.client_sessions FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ==========================================
-- MIGRATION: 20260715002339_51cc7f33-2f74-4983-aede-95ffd42fd164.sql
-- ==========================================

GRANT EXECUTE ON FUNCTION public.is_team(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;

-- ==========================================
-- MIGRATION: 20260715192015_b21c7c02-91fd-476a-8a8f-000370b86280.sql
-- ==========================================


-- Attach trigger on auth.users to run handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profiles and user_roles for existing auth users
DO $$
DECLARE
  u RECORD;
  cnt INT;
  r public.app_role;
BEGIN
  FOR u IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    INSERT INTO public.profiles (id, name, email)
    VALUES (u.id, COALESCE(u.raw_user_meta_data->>'name', split_part(u.email,'@',1)), u.email)
    ON CONFLICT (id) DO NOTHING;

    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = u.id) THEN
      SELECT COUNT(*) INTO cnt FROM public.user_roles;
      r := CASE WHEN cnt = 0 THEN 'owner'::public.app_role ELSE 'collaborator'::public.app_role END;
      INSERT INTO public.user_roles (user_id, role) VALUES (u.id, r);
    END IF;
  END LOOP;
END $$;


-- ==========================================
-- MIGRATION: 20260715192813_8f7aa862-8740-4488-adc3-68488f93ade1.sql
-- ==========================================


-- Allow anonymous read access to clients and their demands for public portal
CREATE POLICY "Anon can read clients for public portal"
ON public.clients FOR SELECT
TO anon
USING (deleted_at IS NULL AND access_active = true);

CREATE POLICY "Anon can read demands for public portal"
ON public.demands FOR SELECT
TO anon
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = demands.client_id
      AND c.deleted_at IS NULL
      AND c.access_active = true
  )
);

GRANT SELECT ON public.clients TO anon;
GRANT SELECT ON public.demands TO anon;


-- ==========================================
-- MIGRATION: 20260715211500_alter_demand_due_date_to_timestamptz.sql
-- ==========================================

-- Alter due_date column from DATE to TIMESTAMPTZ to store both date and time components
ALTER TABLE public.demands ALTER COLUMN due_date TYPE TIMESTAMPTZ USING due_date::TIMESTAMPTZ;


-- ==========================================
-- MIGRATION: 20260716100500_add_estimated_hours_to_demands.sql
-- ==========================================

-- Add estimated_hours to demands table supporting 30-minute increments (e.g. 0.5, 1.0, 1.5)
ALTER TABLE demands ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC DEFAULT 1.0;

-- ==========================================
-- MIGRATION: 20260716222003_cc45f385-50d6-4d49-84fd-48229bdd77ad.sql
-- ==========================================

ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS is_manually_scheduled BOOLEAN NOT NULL DEFAULT false;

-- ==========================================
-- MIGRATION: 20260716235356_69b21e47-654c-4c75-8068-5dd77dc10ed7.sql
-- ==========================================

ALTER TABLE public.demands
  ALTER COLUMN due_date TYPE TIMESTAMPTZ
  USING CASE
    WHEN due_date IS NULL THEN NULL
    ELSE (due_date::date + TIME '09:00') AT TIME ZONE 'America/Sao_Paulo'
  END;


