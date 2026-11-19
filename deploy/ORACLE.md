# Deploy JKR talks lên Oracle Cloud Always Free

Kiến trúc: 1 VM Ubuntu (ARM) chạy Docker Compose gồm `app` (Node + SQLite + WebSocket) và `caddy` (HTTPS tự động, nén, WebSocket).
Dữ liệu (DB, ảnh, bản sao lưu hằng ngày) nằm trong volume Docker `jkr_data`.

## 1. Tạo VM (làm trên web Oracle Cloud)

1. Tạo tài khoản Oracle Cloud (cần thẻ để xác minh, không bị trừ tiền nếu chỉ dùng tài nguyên Always Free). Chọn home region gần Việt Nam (Singapore hoặc Tokyo). **Không đổi được region sau khi chọn.**
2. Compute → Instances → Create instance:
   - Image: **Ubuntu 22.04 hoặc 24.04**
   - Shape: **VM.Standard.A1.Flex** (Ampere ARM), **2 OCPU, 12 GB RAM** là dư cho MVP (Always Free cho tới 4 OCPU / 24 GB)
   - Boot volume: 50 GB. Tải về khóa SSH (private key) và cất kỹ.
3. Nếu báo "Out of capacity": thử lại sau vài giờ, hoặc đổi availability domain. Nâng cấp lên Pay As You Go (vẫn miễn phí trong hạn mức Always Free) thường giúp lấy được máy dễ hơn.
4. Mở cổng: VCN → Subnet → Security List → Add Ingress Rules: nguồn `0.0.0.0/0`, TCP, **Destination** Port Range **80** và **443** (để trống Source Port Range, điền nhầm cột này là lỗi hay gặp) (thêm UDP 443 nếu muốn HTTP/3).

## 2. Chuẩn bị VM

```bash
ssh -i <khoa-ssh>.key ubuntu@<IP-cua-VM>

# Ubuntu của Oracle chặn cổng bằng iptables: mở 80/443.
# Luật phải nằm TRƯỚC dòng REJECT. Kiểm tra: sudo iptables -L INPUT --line-numbers (nếu REJECT không ở dòng 5 thì đổi số 5 thành số dòng của REJECT)
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 5 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Cài Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit   # đăng nhập lại để có quyền docker
```

## 3. Tên miền

- Có tên miền: tạo bản ghi **A** trỏ về IP của VM.
- Chưa có: dùng miễn phí `<IP>.sslip.io`, ví dụ `129.151.10.20.sslip.io` (Caddy vẫn lấy được chứng chỉ HTTPS).

## 4. Đưa code lên và chạy

```bash
git clone <repo-cua-ban> jkr-talks && cd jkr-talks      # hoặc scp/rsync thư mục dự án
cp .env.example .env && nano .env                        # điền DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d --build
docker compose logs -f app                               # thấy "JKR talks chạy tại ..." là xong
```

Mở `https://<DOMAIN>`. Đăng nhập admin bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD` trong `.env`.

## 5. Vận hành

| Việc | Lệnh |
| --- | --- |
| Cập nhật phiên bản mới | `git pull && docker compose up -d --build` |
| Xem log | `docker compose logs -f app` |
| Khởi động lại | `docker compose restart app` |
| Chép bản sao lưu về máy | `docker compose cp app:/data/backups ./backups` |
| Khôi phục | dừng app, chép file `jkr-YYYY-MM-DD.db` thành `/data/jkr.db` trong volume, chạy lại |

- App tự sao lưu SQLite mỗi 24 giờ (giữ 7 bản) vào `/data/backups`. Nên chép định kỳ ra ngoài VM (ví dụ Oracle Object Storage, 20 GB Always Free), vì sao lưu cùng ổ đĩa không cứu được khi mất VM.
- Đổi `ADMIN_PASSWORD` trong `.env` **không** đổi mật khẩu admin đã tạo. Đổi trong app (hoặc xóa user admin trong DB rồi khởi động lại).
- VM Always Free không dùng trong thời gian dài có thể bị Oracle thu hồi: giữ VM hoạt động đều.

## Giới hạn

Chạy đúng 1 instance (SQLite + danh sách kết nối realtime nằm trong bộ nhớ). Với 2 OCPU/12 GB, ước lượng vài trăm đến khoảng 1.000 người online cùng lúc cho một app chat nhẹ (chưa đo thực tế). Khi vượt ngưỡng cần chuyển sang Postgres + Redis và chạy nhiều instance.
