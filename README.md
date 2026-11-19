# JKR talks

Web app cho fan LingOrm trò chuyện theo vị trí địa lý (Việt Nam → miền → tỉnh/thành), kết bạn và lập group riêng.
Đây là bản **MVP** theo `User Stories – JKR talks.md` và thiết kế canvas.

## Chạy thử

Cần Node.js >= 22.5 (dùng `node:sqlite` có sẵn, không cần build native).

```bash
npm install
npm start            # http://localhost:3000
npm test             # 12 test API (DB in-memory)
```

Lần chạy đầu tự tạo `data/jkr.db`, toàn bộ group địa lý (1 quốc gia, 3 miền, 63 tỉnh/thành) và một tài khoản admin
**chỉ ở chế độ dev**: `admin@jkr.local` / `admin12345`.

| Biến môi trường | Ý nghĩa |
| --- | --- |
| `PORT` | Cổng (mặc định 3000) |
| `NODE_ENV=production` | Tắt admin mặc định và việc trả link xác nhận email trong response |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Tạo admin hệ thống khi chưa có (bắt buộc ở production) |
| `REQUIRE_VERIFY=1` | Bật lại bước xác nhận email (mặc định đang bỏ qua) |
| `AGENT_WEBHOOK_URL`, `AGENT_WEBHOOK_TOKEN` | Webhook nhận lỗi từ trang "Danh sách lỗi" (admin chọn lỗi + prompt rồi gửi agent). App POST JSON `{text, prompt, bugs[]}`, token gửi kèm `Authorization: Bearer`. Chưa đặt thì dùng nút "Sao chép prompt" |
| `RETENTION_DAYS` | Số ngày lưu tin nhắn (mặc định 38). Tin cũ hơn bị xóa hẳn (kèm tim và ảnh không còn dùng), kiểm tra lúc khởi động và mỗi 6 giờ |
| `PUBLIC_URL` | Địa chỉ công khai để tạo link ảnh chụp lỗi gửi agent (mặc định tự suy ra) |
| `DB_FILE`, `UPLOAD_DIR` | Vị trí SQLite và thư mục ảnh |
| `TRUST_PROXY=1` | Bật khi chạy sau reverse proxy (rate limit theo IP đúng) |

Chưa cấu hình gửi email: link xác nhận được in ra console server và (ở dev) hiện trên màn hình sau khi đăng ký.

## Kiến trúc

- `server/` Express + `ws` + SQLite (`node:sqlite`). `geo.js` chứa bảng tỉnh/thành → miền; `routes.js` là toàn bộ REST API; `/ws` đẩy realtime (tin nhắn, thông báo, bản tin).
- `public/` SPA thuần JS (ES modules, không build), giao diện theo thiết kế: desktop 3 cột, mobile có thanh tab dưới. Hỗ trợ dark mode theo hệ thống.
- `test/api.test.js` kiểm tra các tiêu chí chấp nhận chính.

## Độ phủ so với user stories

| Epic | Trạng thái |
| --- | --- |
| 1. Tài khoản | Đăng ký email + xác nhận, chọn vùng/tỉnh, đổi home (1 lần/30 ngày, hỏi rời group cũ), hồ sơ, xóa tài khoản. **Chưa có**: đăng nhập mạng xã hội, gửi email thật |
| 2. Group công khai | Auto-join đúng 3 group, chat realtime (chữ, ảnh ≤ 2MB, emoji, trả lời, lịch sử), khám phá + tìm kiếm, join/rời tự do, mute thông báo 1h/8h/vô thời hạn, gợi ý group (ẩn được), quy tắc cộng đồng |
| 3. Bạn bè & 1-1 | Lời mời (không trùng), 3 mức riêng tư, DM chỉ khi là bạn, hủy kết bạn, chặn, tắt trạng thái online |
| 4. Group riêng | Tạo, admin, mời bạn bè, link mời có hạn/thu hồi + admin duyệt, giới hạn 100 (chỉnh tới 200), admin cuối phải chuyển quyền, rời nhóm, giải tán |
| 5. An toàn | Report (tin nhắn/người dùng, ẩn người báo cáo), hàng chờ cho admin hệ thống / mod / admin group riêng, snapshot nội dung bị báo cáo (admin không đọc cả group riêng), xóa tin/mute/kick/cảnh cáo/khóa tạm/khóa vĩnh viễn, nhật ký, trao/thu hồi mod |
| 6. Bản tin | Admin đăng/sửa (nhãn "đã chỉnh sửa")/xóa/ghim, mục riêng + huy hiệu chưa đọc, thông báo realtime, tắt được trong cài đặt |

## Quyết định tạm cho các câu hỏi mở (dễ đổi)

- Khu vực: **3 miền** (`server/geo.js`). Đổi sang 6 vùng chỉ cần sửa file này.
- Giới hạn group riêng: mặc định **100**, admin chỉnh tới **200** (`PRIVATE_LIMIT_*` trong `routes.js`).
- Bạn bè được admin mời trực tiếp vào group riêng: **vào luôn**, không cần duyệt thêm; chỉ người vào bằng link mới chờ duyệt.
- Chưa có độ tuổi tối thiểu, tự ẩn tin khi nhiều report, mã hóa đầu cuối, chính sách lưu tin nhắn: cần quyết định sản phẩm.

## Chưa làm (ngoài phạm vi / cần bổ sung trước khi ra mắt)

- Giao diện chỉ có tiếng Việt (user chọn được ngôn ngữ trong hồ sơ nhưng chưa có bản dịch en/th).
- Web push (hiện thông báo trong app qua WebSocket khi đang mở), email thật, lưu ảnh trên object storage, mở rộng quốc gia, dịch tin nhắn, sự kiện, merch.
- Mã hóa dữ liệu khi lưu (nên bật ở tầng đĩa/DB khi deploy) và HTTPS (đặt sau reverse proxy).
