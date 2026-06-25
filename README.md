# SimpleOJ 2.0

SimpleOJ là một Online Judge Python nhỏ dành cho lớp học. Phiên bản này chạy theo mô hình full-stack: đề và test ẩn nằm ở server, tài khoản và kết quả được lưu trong PostgreSQL, quản trị viên có thể thêm/sửa/import bài tập và quản lý học sinh.

## Tính năng

- Đăng ký, đăng nhập bằng cookie HttpOnly; hai vai trò `ADMIN` và `STUDENT`.
- Kho bài tập, đề Markdown, ví dụ công khai và test case ẩn.
- Lượt làm có thời hạn, đồng hồ đếm ngược và lưu thời gian thực tế.
- Terminal WebSocket tương tác: `input()` ngay trong terminal, Python REPL, `cat main.py`, `clear` và Ctrl+C.
- Nộp và chấm bài Python phía server với test ẩn.
- Lưu điểm, trạng thái, số test đúng, lịch sử và bảng xếp hạng.
- Admin dashboard, CRUD/ẩn bài, import file JSON, phân quyền/khóa tài khoản.
- Rate limit, giới hạn kích thước request, timeout, RAM/CPU/process/output cho runner.
- Monaco sáng kiểu Thonny và xterm.js responsive cho desktop/mobile; không dùng Pyodide hay `window.prompt()`.

> Runner đã có giới hạn tài nguyên nhưng không thay thế một sandbox cấp hệ điều hành chuyên dụng. Với lớp học tin cậy, container Render là mức cô lập hợp lý. Với môi trường công cộng, nên tách judge sang máy riêng dùng nsjail/Isolate hoặc Judge0.

## Chạy local

Yêu cầu: Node.js 20+, Python 3 và PostgreSQL 16 (hoặc Docker).

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed
npm run problems:reset-basic -- --apply
npm run dev
```

Trên PowerShell, thay `cp` bằng:

```powershell
Copy-Item .env.example .env
```

Mở <http://localhost:3000>. Tài khoản admin lấy từ `ADMIN_EMAIL` và `ADMIN_PASSWORD` trong `.env`. Hãy đổi mật khẩu mẫu trước khi deploy.

## Import bài tập

Trong trang **Quản trị → Import JSON**, chọn file chứa một mảng bài. File `problems.json` hiện tại là ví dụ hợp lệ. Schema mới:

```json
[
  {
    "slug": "a-plus-b",
    "title": "Tính tổng",
    "difficulty": "Dễ",
    "description": "Đề bài bằng Markdown",
    "starterCode": "a, b = map(int, input().split())\n",
    "examples": [{ "input": "2 3", "output": "5", "explanation": "" }],
    "testcases": [{ "input": "2 3", "output": "5" }],
    "timeLimitMinutes": 30,
    "executionLimitMs": 1500,
    "isActive": true
  }
]
```

`testcases` chỉ được trả cho admin và judge, không xuất hiện trong API học sinh.

## Deploy Render

Đây là phương án đơn giản nhất vì container có cả Node và Python.

1. Tạo PostgreSQL trên Neon, Supabase, Render hoặc nhà cung cấp tương thích.
2. Push repository lên GitHub và tạo **Blueprint** từ `render.yaml`.
3. Điền các biến môi trường cần thiết:
   - `DATABASE_URL`: URL kết nối tới PostgreSQL (ví dụ: `postgres://user:pass@host:port/db`).
   - `DATABASE_SSL`: Đặt bằng `true` nếu nhà cung cấp yêu cầu kết nối TLS (như Render, Supabase, Neon).
   - `JWT_SECRET`: Khóa bí mật dùng để mã hóa session cookie (nên đặt chuỗi ký tự dài ngẫu nhiên).
   - `ADMIN_EMAIL`: Email tài khoản quản trị (Admin) khởi tạo.
   - `ADMIN_PASSWORD`: Mật khẩu tài khoản admin (tối thiểu 8 ký tự, chứa cả chữ và số).
   - `ADMIN_NAME`: Họ và tên hiển thị của admin (mặc định là `Quản trị viên`).
   - `MAX_GLOBAL_PYTHON_PROCESSES`: Số tiến trình Python chạy đồng thời tối đa toàn server (mặc định: `5`).
   - `PYTHON_RUNNING_TIMEOUT_MS`: Thời gian CPU chạy thực tế tối đa cho mỗi phiên chạy code (mặc định: `10000` - 10 giây).
   - `PYTHON_INPUT_TIMEOUT_MS`: Thời gian chờ nhập `input()` tối đa cho mỗi lần (mặc định: `90000` - 90 giây).
   - `PYTHON_TOTAL_TIMEOUT_MS`: Thời gian chạy tối đa cho cả chương trình (mặc định: `180000` - 3 phút).
   - `TERMINAL_OUTPUT_LIMIT_BYTES`: Giới hạn dung lượng text output trong terminal (mặc định: `262144` - 256KB).
4. Render build từ `Dockerfile`; container tự migrate, bootstrap tài khoản admin rồi khởi động.

`/api/health` được dùng làm health check. Terminal kết nối qua `/ws/terminal`; Render giữ được WebSocket lâu dài và image ưu tiên build `node-pty`. Nếu PTY native không tải được, server tự fallback sang `child_process.spawn` với Python unbuffered; fallback hỗ trợ stdin/stdout nhưng REPL không hoàn hảo bằng PTY.

Code terminal chỉ tồn tại trong thư mục tạm của phiên. Bài tập, tài khoản và điểm vẫn lưu ở PostgreSQL nên container ngủ hoặc được tạo lại không làm mất dữ liệu.

## Deploy Vercel

Vercel chạy API Node qua `vercel.json`, nhưng môi trường serverless không phù hợp cho tiến trình Python/PTY và WebSocket terminal giữ kết nối lâu. Vì vậy bản đầy đủ nên chạy trên Render. Có thể dùng Vercel cho phần web/API không-terminal, nhưng `/ws/terminal` cần được proxy hoặc trỏ về một dịch vụ Render riêng.

1. Deploy một instance Render của chính image này làm judge service.
2. Trên cả Render và Vercel, đặt cùng `JUDGE_SERVICE_TOKEN` dài và ngẫu nhiên.
3. Trên Vercel, đặt `JUDGE_SERVICE_URL=https://<judge-render-domain>` cùng `DATABASE_URL`, `DATABASE_SSL=true`, `JWT_SECRET`.
4. Không công khai token. Endpoint `/internal/judge` từ chối request không có Bearer token đúng.

Nếu chỉ cần một deployment, dùng Render là lựa chọn gọn hơn.

## Lệnh

```bash
npm run dev          # chạy có watch
npm start            # production
npm run db:migrate   # áp dụng migrations
npm run db:seed      # tạo/cập nhật admin, không tự seed bộ bài canonical
npm run db:seed:canonical  # chỉ dùng khi cần seed lại bộ bài canonical cũ
npm run problems:reset-basic -- --apply  # reset dữ liệu bài tập và seed 5 bài cơ bản
npm test             # unit tests
```

## Cấu trúc

```text
public/               SPA học sinh + admin
src/server.js         API, static server và HTTP/WebSocket host
src/auth.js           mật khẩu, JWT, phân quyền
src/judge.js          local/remote judge adapter
src/python-runner.py  thực thi Python có resource limit
src/terminal.js       phiên WebSocket, whitelist lệnh và PTY/spawn
src/terminal-runner.py giới hạn tài nguyên cho Python interactive
public/terminal-client.js giao diện xterm và bàn phím terminal
migrations/           schema PostgreSQL
scripts/              migrate và seed
```
