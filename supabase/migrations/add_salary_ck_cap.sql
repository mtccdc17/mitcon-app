-- Tách lương qua CK: chỉ đưa tối đa salary_ck_cap qua CK lương (Thực nhận 1, tính thuế),
-- phần lương HĐ vượt mức này đẩy sang Thực nhận 2 (chi ngoài), vẫn trừ theo ngày công.
-- 0/null = không tách (giữ nguyên hành vi cũ cho mọi nhân sự khác).
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS salary_ck_cap bigint DEFAULT 0;

-- Snapshot mức cap tại thời điểm tạo dòng lương — giống base_salary_snap / bhxh_base_snap.
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS salary_ck_cap_snap bigint;
