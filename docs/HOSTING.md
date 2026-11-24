# Host Boschtan cho đồng nghiệp

Một máy (Windows/macOS/Linux) chạy server; đồng nghiệp chỉ cần trình duyệt và cùng mạng công ty.

## 1. Cài một lần
- Node.js 20 trở lên và pnpm 9: `npm i -g pnpm@9.15.4` (sau proxy công ty thì đặt HTTP_PROXY/HTTPS_PROXY trước).
- Lấy mã nguồn, rồi trong thư mục dự án: `pnpm install`

## 2. Build và chạy
```bash
pnpm build          # build giao diện (chạy lại sau mỗi lần cập nhật code)
pnpm start          # chạy server, mặc định cổng 8080
```
Server in ra các link, ví dụ `network: http://10.185.71.226:8080/`. Gửi link `network` đó cho đồng nghiệp.
Tắt server: Ctrl+C (ván đang chơi được lưu trước khi tắt).

## 3. Chơi
- Người tạo phòng: nhập tên -> "Tạo phòng" -> chọn số người (2-6) -> gửi mã phòng 5 ký tự hoặc link
  `http://<máy>:8080/?room=MÃ` cho mọi người.
- Mọi người vào, bấm "Sẵn sàng"; chủ phòng bấm "Bắt đầu". Chủ phòng có thể đuổi người trước khi bắt đầu.
- Rớt mạng hoặc tải lại trang: mở lại cùng trình duyệt là vào lại đúng ghế.

## 4. Cấu hình (biến môi trường, tùy chọn)
| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| PORT | 8080 | cổng |
| HOST | 0.0.0.0 | địa chỉ lắng nghe |
| DATA_DIR | data/rooms | nơi lưu ván (mỗi phòng một file JSON) |
| MAX_CONNECTIONS | 200 | tổng số kết nối |
| MAX_CONNECTIONS_PER_IP | 10 | kết nối mỗi IP |
| TRUST_PROXY | tắt | đặt `1` CHỈ khi chạy sau reverse proxy (nginx/IIS) để lấy IP thật từ X-Forwarded-For |
Ví dụ PowerShell: `$env:PORT=9000; pnpm start`

## 5. Lưu ý
- Windows Firewall: lần đầu chạy, cho phép Node.js trên mạng Private/Domain, nếu không đồng nghiệp không vào được.
- Không mở server ra internet; chỉ dùng trong mạng công ty. Không có đăng nhập, ai có link và mã phòng là vào được.
- Sao lưu: copy thư mục `data/rooms`. Server khởi động lại sẽ tự nạp lại các ván đang dở.
- Phòng không ai kết nối trong 30 phút sẽ bị xóa.
- Phòng **đang chạy nằm trong bộ nhớ server**: xóa file JSON khi server còn chạy sẽ không xóa phòng đó, và lúc tắt server bình thường (Ctrl+C) nó có thể được ghi lại. Muốn xóa hẳn một ván: tắt server trước, xóa file trong `data/rooms`, rồi chạy lại. Trong giao diện, nút "Về trang chủ" của ván online đã rời phòng và quên mã phòng; nút "Tạo phòng" luôn mở phòng mới, không tự nạp lại phòng cũ.
- Cập nhật phiên bản: tắt server, cập nhật code, `pnpm install`, `pnpm build`, `pnpm start`.
