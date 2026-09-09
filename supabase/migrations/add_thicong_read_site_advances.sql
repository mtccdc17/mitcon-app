-- Cho tài khoản Thi Công (role 'thicong') XEM (chỉ đọc) bảng tạm ứng công trình
-- để theo dõi ở trang /advance-settlement (Quyết toán tạm ứng).
--
-- Chính sách hiện có "ceo_site_advances" (FOR ALL, role ceo + ketoan) giữ NGUYÊN —
-- policy dưới đây chỉ THÊM quyền SELECT cho thicong, không cấp ghi/sửa/xoá.
-- Giao diện cũng đã ẩn mọi nút thao tác với thicong (canEdit = false).

DROP POLICY IF EXISTS "thicong_read_site_advances" ON site_advances;

CREATE POLICY "thicong_read_site_advances" ON site_advances
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'thicong'
    )
  );
