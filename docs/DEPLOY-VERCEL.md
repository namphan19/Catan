# Deploy Boschtan lên Vercel

## Vì sao phải tách làm hai phần
Vercel chỉ chạy **web tĩnh + hàm serverless ngắn hạn**. Server game (`packages/server`) cần
**WebSocket mở liên tục** và giữ phòng **trong bộ nhớ**, nên không chạy được trên Vercel.

| Phần | Host ở đâu | Ghi chú |
|---|---|---|
| Client (giao diện, `packages/client`) | **Vercel** | file `vercel.json` ở gốc repo |
| Server WebSocket (`packages/server`) | Render / Railway / Fly.io / VPS / máy công ty | cần URL `wss://...` công khai |

Chỉ deploy client mà không có server thì chế độ chơi offline (với bot) vẫn chạy, nhưng chơi online thì không.

## 1. Deploy server (ví dụ Render.com)
New → **Web Service** → chọn repo, rồi điền:
- Runtime: Node (20+)
- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @hexgame/client build`
- Start command: `pnpm --filter @hexgame/server start`
- Environment: `TRUST_PROXY=1` (Render đứng trước bằng reverse proxy). `PORT` do Render tự đặt.

Khi xong sẽ có URL kiểu `https://boschtan-server.onrender.com`, nên WebSocket là
`wss://boschtan-server.onrender.com/ws`. Server này cũng tự phục vụ luôn giao diện, nên chỉ dùng
link Render thôi cũng chơi được, không cần Vercel.

Lưu ý gói miễn phí: server **ngủ sau ~15 phút không có ai** (lần vào đầu tiên chờ ~30-60 giây) và ổ đĩa
**bị xóa mỗi lần khởi động lại**, nên các ván đang dở trong `data/rooms` sẽ mất. Muốn giữ ván thì gắn
persistent disk và đặt `DATA_DIR` trỏ vào đó.

## 2. Deploy client lên Vercel
1. Vercel → **Add New → Project** → import repo này.
2. **Root Directory: để trống** (gốc repo). Các lệnh install/build/output đã có sẵn trong `vercel.json`,
   không cần sửa gì trong phần Build Settings.
3. **Environment Variables**: thêm `VITE_WS_URL` = `wss://boschtan-server.onrender.com/ws` (URL server ở bước 1).
4. Deploy.

`VITE_WS_URL` được nhúng vào lúc **build**: đổi giá trị thì phải **Redeploy**. Không đặt biến này thì client
kết nối tới `wss://<domain-vercel>/ws`, mà địa chỉ đó không có server.

Deploy bằng CLI (thay cho bước 2):
```bash
npx vercel@latest login
npx vercel@latest env add VITE_WS_URL production   # dán wss://.../ws
npx vercel@latest --prod
```

## 3. Các file liên quan
- `vercel.json`: install bằng pnpm (qua corepack, theo `packageManager` trong `package.json`), build
  `@hexgame/client`, xuất `packages/client/dist`, fallback mọi đường dẫn về `index.html`, cache lâu cho `/assets/*`.
- `.vercelignore`: không upload `archive/`, `data/`, `docs/`, `tools/`, e2e.
- `packages/client/src/net/connection.ts`: đọc `VITE_WS_URL`; không có thì dùng cùng domain (như cách chạy cổng 8080 cũ).

## 4. Bảo mật
Game không có đăng nhập: ai có link và mã phòng đều vào được. Đưa server ra internet nghĩa là bất kỳ ai cũng
có thể tạo phòng (server có giới hạn `MAX_CONNECTIONS` / `MAX_CONNECTIONS_PER_IP`, xem `docs/HOSTING.md`).
