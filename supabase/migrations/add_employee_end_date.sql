-- Ngày thôi việc cụ thể của nhân sự (trước đây chỉ có tháng/năm).
-- end_month / end_year vẫn được ghi song song (suy ra từ end_date) để logic bảng lương
-- hiện tại (isActiveInMonth) chạy nguyên: NV còn hiện ở bảng lương THÁNG thôi việc,
-- ẩn hẳn từ tháng kế tiếp trở đi.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS end_date DATE;
