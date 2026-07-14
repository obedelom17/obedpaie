-- ============================================================
-- ElomPaie — Schéma Neon PostgreSQL (Neon Auth version)
-- ÉTAPE 1: Exécuter ce fichier dans Neon SQL Editor
-- NOTE: Les tables neon_auth.* sont créées automatiquement par Neon Auth
-- ============================================================

-- Table de liaison user (Neon Auth) → organisation
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,  -- référence neon_auth.users_sync.id
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tables ElomPaie
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  ifu TEXT,
  rccm TEXT,
  sector TEXT,
  num_employeur TEXT,
  nif TEXT,
  bp TEXT,
  entite_name TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  matricule TEXT,
  position TEXT,
  category TEXT,
  marital_status TEXT,
  children INTEGER DEFAULT 0,
  gender TEXT,
  status TEXT DEFAULT 'actif',
  contract_type TEXT DEFAULT 'CDI',
  hire_date DATE,
  phone TEXT,
  email TEXT,
  ss_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status TEXT DEFAULT 'ouvert',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  base_salary NUMERIC DEFAULT 0,
  sursalaire NUMERIC DEFAULT 0,
  indemnite_grossesse NUMERIC DEFAULT 0,
  indemnite_fonction NUMERIC DEFAULT 0,
  indemnite_communication NUMERIC DEFAULT 0,
  indemnite_logement NUMERIC DEFAULT 0,
  indemnite_repas NUMERIC DEFAULT 0,
  indemnite_transport NUMERIC DEFAULT 0,
  avance_salaire NUMERIC DEFAULT 0,
  remboursement_pret NUMERIC DEFAULT 0,
  deduction_forfaitaire NUMERIC DEFAULT 0,
  heures_sup_25 NUMERIC DEFAULT 0,
  heures_sup_50 NUMERIC DEFAULT 0,
  heures_sup_100 NUMERIC DEFAULT 0,
  bulletin_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_id, employee_id)
);

CREATE TABLE IF NOT EXISTS salary_grids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  echelon TEXT,
  base_salary NUMERIC DEFAULT 0,
  hourly_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_client ON employees(client_id);
CREATE INDEX IF NOT EXISTS idx_employees_org ON employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_client ON payroll_periods(client_id);
CREATE INDEX IF NOT EXISTS idx_payroll_variables_period ON payroll_variables(period_id);
CREATE INDEX IF NOT EXISTS idx_salary_grids_client ON salary_grids(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_org ON user_profiles(organization_id);
