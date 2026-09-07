-- Lịch sử chốt sổ — mỗi lần bấm "Lưu chốt sổ" ghi thêm 1 dòng vào đây (cashflow_settings
-- vẫn chỉ giữ bản MỚI NHẤT đang áp dụng). Dùng để tra lại các mốc chốt trước đó.
CREATE TABLE IF NOT EXISTS cashflow_closings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  closing_date date NOT NULL,
  opening_tk_cty bigint DEFAULT 0,
  opening_tk_cn bigint DEFAULT 0,
  opening_tm bigint DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cashflow_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashflow_closings_select" ON cashflow_closings FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "cashflow_closings_write" ON cashflow_closings FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ceo'));

-- Backfill: đưa mốc chốt đang áp dụng thành dòng lịch sử đầu tiên
INSERT INTO cashflow_closings (closing_date, opening_tk_cty, opening_tk_cn, opening_tm, note)
SELECT closing_date, opening_tk_cty, opening_tk_cn, opening_tm, 'Mốc chốt hiện tại (backfill)'
FROM cashflow_settings
WHERE id = 1 AND closing_date IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM cashflow_closings);
