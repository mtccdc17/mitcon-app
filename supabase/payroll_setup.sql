-- ============================================================
-- MITCON PAYROLL MODULE — chạy trong Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  msnv text UNIQUE,
  title text,
  dept text,
  employment_type text DEFAULT 'chinh_thuc' CHECK (employment_type IN ('chinh_thuc', 'thu_viec', 'thuc_tap_sinh')),
  base_salary bigint NOT NULL DEFAULT 0,
  bhxh_base bigint DEFAULT 0,
  chuancong numeric(5,1) DEFAULT 26,
  hoa_hong_rate numeric(5,2) DEFAULT 0,
  bank_account text DEFAULT '',
  bank_name text DEFAULT '',
  grab_eligible boolean DEFAULT false,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year int NOT NULL CHECK (year >= 2024),
  actual_days numeric(5,1) DEFAULT 0,
  overtime_hours numeric(5,1) DEFAULT 0,
  pc_trach_nhiem bigint DEFAULT 0,
  pc_chuc_vu bigint DEFAULT 0,
  pc_tinh bigint DEFAULT 0,
  pc_grab bigint DEFAULT 0,
  kpi_bonus bigint DEFAULT 0,
  hoa_hong bigint DEFAULT 0,
  pc_giuxe bigint DEFAULT 0,
  pc_dict bigint DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, month, year)
);

-- Seed 6 nhân sự từ bảng lương hiện tại
INSERT INTO employees (name, msnv, title, dept, employment_type, base_salary, bhxh_base, chuancong, hoa_hong_rate, bank_account, bank_name, grab_eligible, sort_order)
VALUES
  ('ĐOÀN PHƯƠNG TRINH',       'PTK01', 'Chuyên viên thiết kế',  'Thiết kế',  'chinh_thuc', 13000000, 5000000, 23.5, 0,   '0421000529025', 'VIETCOMBANK', true,  1),
  ('THIỆU VƯƠNG NGỌC PHONG',  'PTK02', 'Nhân viên thiết kế',    'Thiết kế',  'thu_viec',   11050000, 0,       23.5, 0,   '',              '',            true,  2),
  ('TẤN [cập nhật họ tên]',   'PTK03', 'Lead thiết kế',         'Thiết kế',  'chinh_thuc', 20000000, 5000000, 23.5, 0.5, '',              '',            true,  3),
  ('LÊ HỒNG HIẾU',            'GS04',  'Quản lý thi công',      'Thi công',  'chinh_thuc', 14500000, 5000000, 26,   2,   '234962799',     'ACB',         false, 4),
  ('NGUYỄN TIÊN HOÀNG',       'GS05',  'Giám sát công trình',   'Thi công',  'thu_viec',   11050000, 0,       26,   0,   '',              '',            false, 5),
  ('LÂM THÚY VÂN',            'PMK02', 'Nhân viên marketing',   'Marketing', 'chinh_thuc',  8000000, 5000000, 23.5, 0,   '0766562519',    'MBBANK',      true,  6)
ON CONFLICT (msnv) DO NOTHING;

-- RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_employees" ON employees;
DROP POLICY IF EXISTS "auth_write_employees" ON employees;
DROP POLICY IF EXISTS "auth_all_payroll_entries" ON payroll_entries;

CREATE POLICY "auth_read_employees"    ON employees       FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_employees"   ON employees       FOR ALL    TO authenticated USING (true);
CREATE POLICY "auth_all_payroll_entries" ON payroll_entries FOR ALL  TO authenticated USING (true);
