-- Lovable identificou colunas faltantes no schema que podem causar falha silenciosa no moveDemandStatus
-- (veja Causa 3 na análise do suporte)

ALTER TABLE clients ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sidebar_order JSONB;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS client_edition_id UUID;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS price NUMERIC;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS status_id TEXT;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS is_manually_scheduled BOOLEAN DEFAULT false;

-- Nota: billing_model enum pode ser atualizado com:
-- ALTER TYPE billing_model ADD VALUE IF NOT EXISTS 'seasonal';
-- (se o enum billing_model existir)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_model') THEN
    ALTER TYPE billing_model ADD VALUE IF NOT EXISTS 'seasonal';
  END IF;
END $$;
