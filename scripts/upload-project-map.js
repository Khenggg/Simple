import { spawn } from 'child_process';
import { createServer } from 'net';
import { existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');
const PROJECT_MAP_PATH = join(REPO_ROOT, 'docs', 'project-map.md');

const CHROME_PROFILE = 'C:\\Users\\Ken\\AppData\\Local\\Google\\Chrome\\User Data Automation';
const CHROME_EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address) resolvePort(address.port);
        else reject(new Error('Failed to allocate port'));
      });
    });
    server.on('error', reject);
  });
}

async function waitForCdp(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const body = await res.json();
        if (body.webSocketDebuggerUrl) return body.webSocketDebuggerUrl;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`CDP not ready on port ${port}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.onReady = new Promise((resolve) => {
      this.ws.onopen = resolve;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
  }

  async send(method, params = {}) {
    await this.onReady;
    const id = this.nextId++;
    const payload = { id, method, params };
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  if (!existsSync(PROJECT_MAP_PATH)) {
    console.error(`Error: project-map.md not found at ${PROJECT_MAP_PATH}`);
    process.exit(1);
  }

  console.log(`Starting Chrome with profile: ${CHROME_PROFILE}...`);
  const port = await getFreePort();
  const chromeProcess = spawn(CHROME_EXE, [
    `--remote-debugging-port=${port}`,
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

  console.log(`Waiting for DevTools Protocol on port ${port}...`);
  await waitForCdp(port);

  // Find ChatGPT target
  console.log('Connecting to ChatGPT tab...');
  let chatgptTarget = null;
  for (let i = 0; i < 20; i++) {
    try {
      const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await listRes.json();
      chatgptTarget = targets.find(t => t.url.includes('chatgpt.com') && t.type === 'page');
      if (chatgptTarget) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }

  if (!chatgptTarget) {
    console.error('Error: Could not find ChatGPT tab');
    process.exit(1);
  }

  const client = new CdpClient(chatgptTarget.webSocketDebuggerUrl);

  console.log('Waiting for composer to load...');
  const COMPOSER_SELECTORS = [
    '[data-testid="composer-text-input"]',
    '#prompt-textarea',
    'textarea[placeholder*="Message"]',
    'div[role="textbox"][contenteditable="true"]',
  ];

  let composerFound = false;
  for (let i = 0; i < 30; i++) {
    const res = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const selectors = ${JSON.stringify(COMPOSER_SELECTORS)};
        const element = selectors.map((s) => document.querySelector(s)).find((c) => c && c.getClientRects().length);
        return Boolean(element);
      })()`,
      returnByValue: true
    });
    if (res?.result?.value) {
      composerFound = true;
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!composerFound) {
    console.error('Error: ChatGPT composer not found. Please log in or refresh the browser.');
    client.close();
    process.exit(1);
  }

  console.log('DOM node enabling...');
  await client.send('DOM.enable');

  console.log('Locating file input element...');
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
    console.error('Error: File input element not found');
    client.close();
    process.exit(1);
  }

  console.log(`Uploading ${PROJECT_MAP_PATH}...`);
  await client.send('DOM.setFileInputFiles', {
    nodeId: fileInputNode.nodeId,
    files: [resolve(PROJECT_MAP_PATH)]
  });

  console.log('Waiting 6 seconds for file upload to complete...');
  await new Promise(r => setTimeout(r, 6000));

  console.log('Focusing composer and entering prompt...');
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

  // Type the text using CDP input
  await client.send('Input.insertText', { text: promptText });

  console.log('Submitting prompt...');
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

  if (clicked?.result?.value) {
    console.log('Successfully sent the file and prompt to ChatGPT!');
  } else {
    console.log('Could not click Send button automatically (maybe file is still uploading or button disabled). Press Enter or click Send in the browser.');
  }

  client.close();
  console.log('Done! The browser window remains open for your conversation.');
}

main().catch(console.error);
