-- Tách ngày nghỉ KHÔNG phép khỏi ngày nghỉ CÓ phép trên bảng lương.
-- ngay_nghi_phep (đã có) = nghỉ CÓ phép, trừ vào phép năm.
-- 2 cột dưới = nghỉ KHÔNG phép, KHÔNG trừ phép năm, chỉ để CEO theo dõi.
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS ngay_nghi_khong_phep numeric(5,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ngay_nghi_khong_phep_ghi_chu text;
