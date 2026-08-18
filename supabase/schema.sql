-- =============================================
-- MITCON DECOR & DESIGN — Database Schema
-- =============================================

-- ENUM types
CREATE TYPE user_role AS ENUM ('ceo', 'ketoan', 'thicong', 'thumua');
CREATE TYPE project_status AS ENUM ('active', 'completed', 'archived');
CREATE TYPE contract_type AS ENUM ('vat', 'no_vat');
CREATE TYPE vat_rate AS ENUM ('vat_10', 'vat_8', 'no_vat');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'partial');
CREATE TYPE invoice_status AS ENUM ('has_invoice', 'waiting', 'no_invoice');
CREATE TYPE contract_status AS ENUM ('signed', 'not_signed');
CREATE TYPE revenue_status AS ENUM ('collected', 'pending');
CREATE TYPE opex_tax_type AS ENUM ('deductible_vat', 'deductible_no_vat', 'non_deductible');

-- =============================================
-- USERS (extends Supabase auth.users)
-- =============================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'thumua',
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROJECTS (Công trình)
-- =============================================
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  address TEXT,
  start_date DATE,
  end_date DATE,
  status project_status DEFAULT 'active',
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CONTRACTS (Hợp đồng con trong công trình)
-- =============================================
CREATE TABLE contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  type contract_type NOT NULL,
  value BIGINT NOT NULL DEFAULT 0,
  description TEXT,
  invoice_issue_date DATE,      -- Ngày xuất hóa đơn GTGT đầu ra (chỉ áp dụng HĐ Xuất VAT)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CATEGORIES (Hạng mục: Thạch cao, Điện, Sơn...)
-- =============================================
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TRANSACTIONS (Chi phí theo hạng mục)
-- =============================================
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL,
  unit TEXT NOT NULL,          -- phòng ban nhập
  description TEXT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  -- Vật tư fields
  vat_rate vat_rate DEFAULT 'no_vat',
  vat_amount BIGINT DEFAULT 0,
  invoice_status invoice_status DEFAULT 'no_invoice',
  invoice_number TEXT,
  invoice_date DATE,
  supplier TEXT,
  -- Nhân công fields
  is_labor BOOLEAN DEFAULT FALSE,
  tncn_amount BIGINT DEFAULT 0,
  actual_paid BIGINT DEFAULT 0,
  labor_contract_status contract_status DEFAULT 'not_signed',
  -- Payment
  payment_status payment_status DEFAULT 'pending',
  payment_date DATE,
  -- Meta
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- AUDIT TRAIL
-- =============================================
CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  user_role user_role NOT NULL
);

-- =============================================
-- REVENUE (Doanh thu từ khách hàng)
-- =============================================
CREATE TABLE revenue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  stage TEXT NOT NULL,          -- Đợt 1, Đợt 2...
  amount BIGINT NOT NULL DEFAULT 0,
  collected_date DATE,
  payment_method TEXT DEFAULT 'Chuyển khoản',
  status revenue_status DEFAULT 'pending',
  note TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- OPERATING COSTS (Chi phí vận hành — CEO only)
-- =============================================
CREATE TABLE operating_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month INT NOT NULL,
  year INT NOT NULL,
  description TEXT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  cost_type TEXT NOT NULL,      -- 'salary','bhxh','bonus','office','equipment','other'
  vat_rate vat_rate DEFAULT 'no_vat',
  tax_type opex_tax_type DEFAULT 'non_deductible',
  is_deductible BOOLEAN DEFAULT FALSE,
  note TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SECURITY CONFIG (Bảo mật xóa app — CEO only)
-- =============================================
CREATE TABLE security_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code_layer1_hash TEXT,
  code_layer2_hash TEXT,
  otp_email TEXT,
  otp_configured BOOLEAN DEFAULT FALSE,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_config ENABLE ROW LEVEL SECURITY;

-- Profiles: mỗi người chỉ đọc profile của mình
-- (không dùng subquery tự tham chiếu profiles ở đây — gây "infinite recursion detected in policy")
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Projects: tất cả 4 roles được xem
CREATE POLICY "projects_select_all" ON projects FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "projects_insert_ketoan_ceo" ON projects FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'ketoan')
  ));

CREATE POLICY "projects_update_ketoan_ceo" ON projects FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'ketoan')
  ));

-- Contracts: tất cả xem, CEO/kế toán sửa
CREATE POLICY "contracts_select" ON contracts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "contracts_write" ON contracts FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'ketoan')));

-- Categories: tất cả xem, CEO/kế toán/thi công sửa
CREATE POLICY "categories_select" ON categories FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "categories_write" ON categories FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'ketoan', 'thicong')));

-- Transactions: tất cả xem, thi công/kế toán/thu mua nhập (phần của mình)
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "transactions_insert" ON transactions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()));
CREATE POLICY "transactions_update_ketoan_ceo" ON transactions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'ketoan'))
    OR created_by = auth.uid());

-- Audit logs: tất cả xem
CREATE POLICY "audit_select" ON audit_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Revenue: tất cả xem TT, CEO xem đủ (filter ở app level)
CREATE POLICY "revenue_select" ON revenue FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "revenue_write" ON revenue FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'ketoan')));

-- Operating costs: CHỈ CEO
CREATE POLICY "opex_ceo_only" ON operating_costs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ceo'));

-- Security config: CHỈ CEO
CREATE POLICY "security_ceo_only" ON security_config FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ceo'));

-- =============================================
-- TRIGGERS — updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_opex_updated BEFORE UPDATE ON operating_costs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_site_advances_updated BEFORE UPDATE ON site_advances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- SITE ADVANCES (Tạm ứng công trình)
-- =============================================
CREATE TABLE site_advances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  project_name TEXT NOT NULL,
  employee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL,
  channel TEXT DEFAULT 'tk_cn',  -- tk_cty, tk_cn, tm
  amount BIGINT NOT NULL DEFAULT 0,
  returned BIGINT DEFAULT 0,
  note TEXT,
  date DATE NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE site_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_advances_select" ON site_advances FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "site_advances_write" ON site_advances FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'ketoan')));

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_transactions_project ON transactions(project_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_audit_transaction ON audit_logs(transaction_id);
CREATE INDEX idx_revenue_project ON revenue(project_id);
CREATE INDEX idx_opex_month_year ON operating_costs(year, month);
CREATE INDEX idx_site_advances_project ON site_advances(project_id);
CREATE INDEX idx_site_advances_employee ON site_advances(employee_id);
