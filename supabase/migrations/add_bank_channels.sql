-- Danh mục ngân hàng con trong "TK Cá nhân" — Sếp tự thêm/xóa qua app, không cần sửa code
CREATE TABLE bank_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_channels_select" ON bank_channels FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "bank_channels_write" ON bank_channels FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'ketoan')));

-- Seed đúng 3 ngân hàng đang dùng, giữ nguyên dữ liệu cũ
INSERT INTO bank_channels (code, label, sort_order) VALUES
  ('ocb', 'OCB', 1),
  ('lp', 'LPBank', 2),
  ('mb', 'MB', 3);
