import express from 'express';
import { spawn, execSync, exec } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');
const PROJECT_MAP_PATH = join(REPO_ROOT, 'docs', 'project-map.md');

const CHROME_PROFILE = 'C:\\Users\\Ken\\AppData\\Local\\Google\\Chrome\\User Data Automation';
const CHROME_EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PORT = 49192;
const PORT = 3001;

// Kill any existing Chrome session using the automation profile
function killExistingChrome() {
  try {
    const output = execSync('wmic process where "name=\'chrome.exe\'" get ProcessID,CommandLine /format:list', { encoding: 'utf8' });
    const blocks = output.split('\r\n\r\n');
    let killedCount = 0;
    for (const block of blocks) {
      if (block.includes('User Data Automation')) {
        const match = block.match(/ProcessId=(\d+)/i);
        if (match) {
          try {
            process.kill(parseInt(match[1]), 'SIGKILL');
            killedCount++;
          } catch (e) {}
        }
      }
    }
    return killedCount;
  } catch (e) {
    return 0;
  }
}

// Check if Chrome is listening on port
async function isChromeRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`);
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Wait for CDP to be ready
async function waitForCdp(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isChromeRunning()) {
      return true;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('CDP connection timed out');
}

// CDP Client Helper
class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.onReady = new Promise((resolveReady, rejectReady) => {
      this.ws.on('open', resolveReady);
      this.ws.on('error', rejectReady);
    });
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject: rej, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
  }

  async send(method, params = {}) {
    await this.onReady;
    const id = this.nextId++;
    const payload = { id, method, params };
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`${method} timed out`));
      }, 30000);
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend, timer });
    });
  }

  close() {
    this.ws.close();
  }
}

// Find ChatGPT tab target
async function getChatgptTarget() {
  const listRes = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/list`);
  const targets = await listRes.json();
  const target = targets.find(t => t.url.includes('chatgpt.com') && t.type === 'page');
  if (!target) throw new Error('ChatGPT tab not found. Make sure ChatGPT is open.');
  return target;
}

const app = express();
app.use(express.json());

// Main HTML Page
const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Control Panel - SimpleOJ</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(22, 28, 45, 0.4);
      --border: rgba(255, 255, 255, 0.08);
      --text: #f3f4f6;
      --text-mute: #9ca3af;
      --primary: linear-gradient(135deg, #4f46e5, #7c3aed);
      --success: linear-gradient(135deg, #10b981, #059669);
      --accent: linear-gradient(135deg, #d946ef, #9333ea);
      --font: 'Outfit', sans-serif;
      --mono: 'JetBrains Mono', monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2.5rem 1rem;
      overflow-x: hidden;
      position: relative;
    }

    body::before {
      content: '';
      position: absolute;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(0,0,0,0) 70%);
      top: -200px;
      left: 50%;
      transform: translateX(-50%);
      z-index: -1;
      pointer-events: none;
    }

    .container {
      width: 100%;
      max-width: 960px;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    header {
      text-align: center;
      margin-bottom: 0.5rem;
    }

    h1 {
      font-size: 2.2rem;
      font-weight: 700;
      background: linear-gradient(to right, #818cf8, #c084fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      color: var(--text-mute);
      font-size: 1rem;
    }

    /* Grid layout */
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }

    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.25rem;
      backdrop-filter: blur(12px);
      transition: transform 0.2s, border-color 0.2s;
    }

    .card:hover {
      border-color: rgba(255, 255, 255, 0.15);
    }

    /* Status card details */
    .status-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .status-label {
      color: var(--text-mute);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-val {
      font-size: 1.2rem;
      font-weight: 600;
      margin-top: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .badge-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: #ef4444;
      display: inline-block;
      box-shadow: 0 0 8px #ef4444;
    }

    .badge-dot.active {
      background-color: #10b981;
      box-shadow: 0 0 8px #10b981;
    }

    /* Action Buttons Area */
    .actions-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .action-btn {
      width: 100%;
      padding: 1.2rem 1.5rem;
      border: none;
      border-radius: 14px;
      color: white;
      font-size: 1.1rem;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: transform 0.2s, box-shadow 0.2s, filter 0.2s;
      position: relative;
      overflow: hidden;
      font-family: var(--font);
    }

    .action-btn::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(rgba(255, 255, 255, 0.1), transparent);
      opacity: 0;
      transition: opacity 0.2s;
    }

    .action-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
    }

    .action-btn:hover::after {
      opacity: 1;
    }

    .action-btn:active {
      transform: translateY(0);
    }

    .action-btn.btn-1 { background: var(--primary); }
    .action-btn.btn-2 { background: var(--success); }
    .action-btn.btn-3 { background: var(--accent); }

    .btn-desc {
      font-size: 0.85rem;
      font-weight: 400;
      color: rgba(255, 255, 255, 0.7);
      margin-top: 0.25rem;
    }

    .btn-icon {
      font-size: 1.5rem;
      background: rgba(255, 255, 255, 0.15);
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }

    /* Output Panel */
    .output-panel {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .output-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .output-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-mute);
    }

    .copy-btn {
      padding: 0.4rem 0.8rem;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.2s;
      font-family: var(--font);
    }

    .copy-btn:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .output-box {
      width: 100%;
      min-height: 250px;
      max-height: 500px;
      background-color: rgba(13, 17, 28, 0.7);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
      overflow-y: auto;
      font-family: var(--mono);
      font-size: 0.9rem;
      line-height: 1.5;
      white-space: pre-wrap;
      color: #e5e7eb;
    }

    /* Console logs */
    .console-panel {
      background-color: #05070c;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.75rem 1rem;
      font-family: var(--mono);
      font-size: 0.8rem;
      color: #34d399;
      height: 100px;
      overflow-y: auto;
    }

    .log-line {
      margin-bottom: 0.25rem;
    }

    .log-time {
      color: var(--text-mute);
      margin-right: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>ChatGPT Control Panel</h1>
      <p class="subtitle">Bảng điều khiển tương tác thủ công và tải lên bản đồ SimpleOJ</p>
    </header>

    <div class="dashboard-grid">
      <!-- Status Cards -->
      <div class="card status-card">
        <div>
          <div class="status-label">Trạng thái Chrome</div>
          <div class="status-val" id="chrome-status"><span class="badge-dot" id="chrome-dot"></span> Đang kiểm tra...</div>
        </div>
      </div>
      <div class="card status-card">
        <div>
          <div class="status-label">Kích thước Project Map</div>
          <div class="status-val" id="map-size">Đang đọc...</div>
        </div>
      </div>
      <div class="card status-card">
        <div>
          <div class="status-label">Thao tác cuối</div>
          <div class="status-val" id="last-action" style="font-size:1rem;font-weight:400;color:var(--text-mute)">Không có</div>
        </div>
      </div>
    </div>

    <!-- Actions Panel -->
    <div class="actions-panel">
      <button class="action-btn btn-1" onclick="runAction('open-and-upload')">
        <div>
          <div>1. Khởi tạo & Tải lên (Đính kèm file)</div>
          <div class="btn-desc">Mở Chrome ChatGPT, đính kèm file project-map.md, nhập lời nhắc sẵn (không bấm gửi)</div>
        </div>
        <div class="btn-icon">📁</div>
      </button>

      <button class="action-btn btn-2" onclick="runAction('send')">
        <div>
          <div>2. Gửi câu hỏi (Send Prompt)</div>
          <div class="btn-desc">Kích hoạt lệnh click gửi câu hỏi đang chờ trong trình duyệt ChatGPT</div>
        </div>
        <div class="btn-icon">🚀</div>
      </button>

      <button class="action-btn btn-3" onclick="runAction('retrieve')">
        <div>
          <div>3. Lấy câu trả lời (Get Response)</div>
          <div class="btn-desc">Tìm và trích xuất câu trả lời mới nhất từ ChatGPT về bảng điều khiển này</div>
        </div>
        <div class="btn-icon">📥</div>
      </button>
    </div>

    <!-- Output Response Area -->
    <div class="output-panel">
      <div class="output-header">
        <div class="output-title">Kết quả trích xuất từ ChatGPT</div>
        <button class="copy-btn" onclick="copyOutput()">Sao chép</button>
      </div>
      <div class="output-box" id="output-box">Hộp thoại trống. Hãy chạy hành động lấy dữ liệu.</div>
    </div>

    <!-- Console Log Area -->
    <div class="console-panel" id="console-logs">
      <div class="log-line"><span class="log-time">[Hệ thống]</span> Khởi động bảng điều khiển thành công...</div>
    </div>
  </div>

  <script>
    const logsContainer = document.getElementById('console-logs');

    function addLog(message) {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const div = document.createElement('div');
      div.className = 'log-line';
      div.innerHTML = \`<span class="log-time">[\${timeStr}]</span> \${message}\`;
      logsContainer.appendChild(div);
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    async function checkStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        const chromeDot = document.getElementById('chrome-dot');
        const chromeStatus = document.getElementById('chrome-status');
        if (data.chromeRunning) {
          chromeDot.className = 'badge-dot active';
          chromeStatus.innerHTML = '<span class="badge-dot active"></span> Đang chạy';
        } else {
          chromeDot.className = 'badge-dot';
          chromeStatus.innerHTML = '<span class="badge-dot"></span> Đã đóng';
        }

        document.getElementById('map-size').innerText = data.mapSizeKB + ' KB';
      } catch (e) {
        console.error(e);
      }
    }

    async function runAction(action) {
      addLog(\`Bắt đầu chạy hành động: \${action}...\`);
      document.getElementById('last-action').innerText = action;

      try {
        const res = await fetch(\`/api/\${action}\`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          addLog(\`Thành công: \${data.message}\`);
          if (action === 'retrieve') {
            document.getElementById('output-box').innerText = data.content || 'Không trích xuất được nội dung.';
          }
        } else {
          addLog(\`Lỗi: \${data.error}\`);
        }
      } catch (e) {
        addLog(\`Lỗi kết nối API: \${e.message}\`);
      }
      checkStatus();
    }

    function copyOutput() {
      const text = document.getElementById('output-box').innerText;
      navigator.clipboard.writeText(text).then(() => {
        addLog('Đã sao chép nội dung vào Clipboard.');
      });
    }

    // Poll status every 3 seconds
    setInterval(checkStatus, 3000);
    checkStatus();
  </script>
</body>
</html>
`;

// Route endpoints
app.get('/', (_req, res) => {
  res.send(HTML_CONTENT);
});

app.get('/api/status', async (_req, res) => {
  let mapSizeKB = 0;
  if (existsSync(PROJECT_MAP_PATH)) {
    const stats = statSync(PROJECT_MAP_PATH);
    mapSizeKB = (stats.size / 1024).toFixed(1);
  }
  const chromeRunning = await isChromeRunning();
  res.json({
    chromeRunning,
    mapSizeKB
  });
});

app.post('/api/open-and-upload', async (_req, res) => {
  try {
    // Generate fresh project-map.md first
    try {
      execSync('node scripts/generate-project-map.js', { cwd: REPO_ROOT });
    } catch (err) {
      console.error('Failed to generate project map:', err);
    }

    if (!existsSync(PROJECT_MAP_PATH)) {
      return res.status(400).json({ success: false, error: 'Chưa sinh file project-map.md và không thể tự động khởi tạo.' });
    }

    // Kill any existing automation Chrome
    killExistingChrome();

    // Spawn Chrome on port CHROME_PORT
    const chromeProcess = spawn(CHROME_EXE, [
      `--remote-debugging-port=${CHROME_PORT}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${CHROME_PROFILE}`,
      '--profile-directory=Default',
      '--no-first-run',
      '--no-default-browser-check',
      'https://chatgpt.com/'
    ], {
      detached: true,
      stdio: 'ignore'
    });
    chromeProcess.unref();

    await waitForCdp();

    // Connect & upload
    let chatgptTarget = null;
    for (let i = 0; i < 20; i++) {
      try {
        const listRes = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/list`);
        const targets = await listRes.json();
        chatgptTarget = targets.find(t => t.url.includes('chatgpt.com') && t.type === 'page');
        if (chatgptTarget) break;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 500));
    }

    if (!chatgptTarget) {
      return res.json({ success: false, error: 'Không tìm thấy tab ChatGPT.' });
    }

    const client = new CdpClient(chatgptTarget.webSocketDebuggerUrl);

    // Wait for composer
    const COMPOSER_SELECTORS = [
      '[data-testid="composer-text-input"]',
      '#prompt-textarea',
      'textarea[placeholder*="Message"]',
      'div[role="textbox"][contenteditable="true"]',
    ];

    let composerFound = false;
    for (let i = 0; i < 30; i++) {
      const evalRes = await client.send('Runtime.evaluate', {
        expression: `(() => {
          const selectors = ${JSON.stringify(COMPOSER_SELECTORS)};
          const element = selectors.map((s) => document.querySelector(s)).find((c) => c && c.getClientRects().length);
          return Boolean(element);
        })()`,
        returnByValue: true
      });
      if (evalRes?.result?.value) {
        composerFound = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!composerFound) {
      client.close();
      return res.json({ success: false, error: 'Trình soạn thảo của ChatGPT không hiển thị. Hãy đăng nhập trước.' });
    }

    // Set file input
    await client.send('DOM.enable');
    let fileInputNode = null;
    for (let i = 0; i < 10; i++) {
      const doc = await client.send('DOM.getDocument');
      fileInputNode = await client.send('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector: 'input[type="file"]'
      });
      if (fileInputNode && fileInputNode.nodeId) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!fileInputNode || !fileInputNode.nodeId) {
      client.close();
      return res.json({ success: false, error: 'Không tìm thấy thẻ upload file.' });
    }

    await client.send('DOM.setFileInputFiles', {
      nodeId: fileInputNode.nodeId,
      files: [resolve(PROJECT_MAP_PATH)]
    });

    // Wait a brief moment for upload initiation, then enter text
    await new Promise(r => setTimeout(r, 2000));

    const promptText = 'Tôi gửi file project-map.md chứa toàn bộ cấu trúc và mã nguồn của dự án SimpleOJ. Hãy đọc file này để hiểu kiến trúc hệ thống và chuẩn bị hỗ trợ tôi lập trình.';
    await client.send('Runtime.evaluate', {
      expression: `(() => {
        const selectors = ${JSON.stringify(COMPOSER_SELECTORS)};
        const element = selectors.map((s) => document.querySelector(s)).find((c) => c && c.getClientRects().length);
        if (!element) return false;
        element.focus();
        if ('value' in element) {
          element.value = '';
        } else {
          element.textContent = '';
        }
        return true;
      })()`,
      returnByValue: true
    });

    await client.send('Input.insertText', { text: promptText });
    client.close();

    res.json({ success: true, message: 'Đã mở Chrome, tải lên project-map.md và điền prompt mẫu.' });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/api/send', async (_req, res) => {
  try {
    if (!(await isChromeRunning())) {
      return res.status(400).json({ success: false, error: 'Chrome đang đóng. Hãy bấm hành động 1 để mở trước.' });
    }

    const chatgptTarget = await getChatgptTarget();
    const client = new CdpClient(chatgptTarget.webSocketDebuggerUrl);

    const SEND_BUTTON_SELECTORS = [
      '[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[data-testid*="send"]',
    ];

    const clicked = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const selectors = ${JSON.stringify(SEND_BUTTON_SELECTORS)};
        const button = selectors.map((s) => document.querySelector(s)).find((c) => c && c.getClientRects().length && !c.disabled);
        if (!button) return false;
        button.click();
        return true;
      })()`,
      returnByValue: true
    });

    client.close();

    if (clicked?.result?.value) {
      res.json({ success: true, message: 'Đã bấm nút gửi câu hỏi.' });
    } else {
      res.json({ success: false, error: 'Không bấm được nút gửi (Nút bị vô hiệu hóa hoặc đang tải file).' });
    }
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/api/retrieve', async (_req, res) => {
  try {
    if (!(await isChromeRunning())) {
      return res.status(400).json({ success: false, error: 'Chrome đang đóng. Hãy bấm hành động 1 để mở trước.' });
    }

    const chatgptTarget = await getChatgptTarget();
    const client = new CdpClient(chatgptTarget.webSocketDebuggerUrl);

    // Retrieve the last assistant message
    const evalRes = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const nodes = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
        const lastNode = nodes.at(-1);
        if (!lastNode) return null;
        
        // Helper to grab raw text while preserving code block format
        return lastNode.innerText;
      })()`,
      returnByValue: true
    });

    client.close();

    const content = evalRes?.result?.value;
    if (content) {
      res.json({ success: true, message: 'Đã lấy câu trả lời thành công.', content });
    } else {
      res.json({ success: false, error: 'Chưa thấy câu trả lời nào từ Assistant trên trang.' });
    }
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`ChatGPT GUI Controller is running at http://localhost:${PORT}`);
  console.log(`Opening control panel in your default browser...`);
  console.log(`======================================================\n`);
  
  if (process.platform === 'win32') {
    exec(`start http://localhost:${PORT}`);
  } else if (process.platform === 'darwin') {
    exec(`open http://localhost:${PORT}`);
  } else {
    exec(`xdg-open http://localhost:${PORT}`);
  }
});
