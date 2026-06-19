import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config.js';
import { query } from './db.js';

const terminalRunnerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'terminal-runner.py');
const COOKIE_NAME = 'simpleoj_session';
const MAX_CODE_SIZE = 64 * 1024; // 64KB
const MAX_OUTPUT_SIZE = config.terminalOutputLimitBytes;
const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

let ptyModulePromise;
const activeSessions = new Map();
const runningProcesses = new Set();

function loadPty() {
  if (!ptyModulePromise) {
    ptyModulePromise = import('node-pty').then((module) => module.default || module).catch(() => null);
  }
  return ptyModulePromise;
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

async function authenticate(request) {
  try {
    const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
    if (!token) return null;
    const payload = jwt.verify(token, config.jwtSecret);
    const { rows } = await query('SELECT id,role,is_active FROM users WHERE id=$1', [payload.sub]);
    return rows[0]?.is_active ? rows[0] : null;
  } catch {
    return null;
  }
}

function rejectUpgrade(socket, status, message) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`);
  socket.destroy();
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function normalizeCommand(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

class TerminalSession {
  constructor(ws, user) {
    this.ws = ws;
    this.user = user;
    this.process = null;
    this.processKind = null;
    this.workdir = null;
    this.outputBytes = 0;
    this.closed = false;
    
    this.idleTimer = null;
    
    // Process state & timers
    this.processState = 'RUNNING'; // 'RUNNING' or 'WAITING_INPUT'
    this.runningTimeLeft = 10000; // 10 seconds of active CPU time left
    this.lastRunningStartTime = 0;
    this.processKilledReason = null;
    
    this.processActiveTimer = null;
    this.processInputTimer = null;
    this.processLifetimeTimer = null;
    
    this.replIdleTimer = null;
    this.replLifetimeTimer = null;
  }

  async start() {
    this.touch();
    sendJson(this.ws, { type: 'ready' });
  }

  touch() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.output('\r\nPhiên terminal đã hết hạn do không hoạt động.\r\n');
      this.close(1000, 'Session expired');
    }, SESSION_IDLE_TIMEOUT_MS);
  }

  output(data) {
    if (!data || this.closed) return;
    const text = String(data);
    this.outputBytes += Buffer.byteLength(text);
    if (this.outputBytes > MAX_OUTPUT_SIZE) {
      sendJson(this.ws, { type: 'output', data: '\r\n[Output limit exceeded: chương trình in quá nhiều dữ liệu]\r\n' });
      this.processKilledReason = 'OUTPUT_LIMIT';
      this.stopProcess('SIGKILL');
      return;
    }
    sendJson(this.ws, { type: 'output', data: text });
  }

  async handle(message) {
    this.touch();
    if (!message || typeof message !== 'object') return;

    if (message.type === 'runFile') {
      const code = String(message.code || '').slice(0, 64 * 1024);
      if (String(message.code || '').length > 64 * 1024) {
        sendJson(this.ws, { type: 'error', message: 'Mã nguồn vượt quá giới hạn 64KB.' });
        return;
      }
      await this.killActiveProcess();
      
      if (!this.workdir) {
        this.workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'simpleoj-terminal-'));
        await fs.chmod(this.workdir, 0o755).catch(() => {});
      }
      
      await fs.writeFile(path.join(this.workdir, 'main.py'), code, { encoding: 'utf8', mode: 0o644 });
      await this.runPython('main.py');
    }

    else if (message.type === 'startRepl') {
      await this.killActiveProcess();
      
      if (!this.workdir) {
        this.workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'simpleoj-terminal-'));
        await fs.chmod(this.workdir, 0o755).catch(() => {});
      }
      
      await this.runPython('--repl');
    }

    else if (message.type === 'stdin') {
      if (this.process) {
        const data = String(message.data || '').slice(0, 4096);
        if (this.replIdleTimer) {
          this.resetReplIdleTimer();
        }
        if (this.processKind === 'pty') {
          this.process.write(data);
        } else {
          this.process.stdin?.write(data);
        }
      }
    }

    else if (message.type === 'interrupt') {
      await this.interrupt();
    }

    else if (message.type === 'dispose') {
      await this.close(1000, 'Client disposed');
    }
  }

  async runPython(mode) {
    if (runningProcesses.size >= config.maxGlobalPythonProcesses) {
      sendJson(this.ws, { type: 'error', message: 'Server busy, please try again' });
      sendJson(this.ws, { type: 'exit', code: 1 });
      return;
    }

    this.outputBytes = 0;
    const pty = await loadPty();
    const dropPrivileges = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() === 0;
    const env = {
      PATH: process.env.PATH || '',
      LANG: process.env.LANG || 'C.UTF-8',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    };

    if (pty && mode === '--repl') {
      try {
        this.processKind = 'pty';
        this.process = pty.spawn(config.pythonCommand, ['-u', '-I', terminalRunnerPath, mode], {
          name: 'xterm-256color', cwd: this.workdir, env, cols: 80, rows: 24,
          ...(dropPrivileges ? { uid: 65534, gid: 65534 } : {})
        });
        runningProcesses.add(this.process);
        
        const proc = this.process;
        this.process.onData((data) => this.output(data));
        this.process.onExit(() => {
          runningProcesses.delete(proc);
          this.finishProcess();
        });
      } catch {
        this.process = null;
        this.processKind = null;
      }
    }

    if (!this.process) {
      try {
        this.processKind = 'spawn';
        const args = mode === '--repl'
          ? ['-u', '-i', '-I', terminalRunnerPath, mode]
          : ['-u', '-I', terminalRunnerPath, mode];
          
        this.process = spawn(config.pythonCommand, args, {
          cwd: this.workdir, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
          ...(dropPrivileges ? { uid: 65534, gid: 65534 } : {})
        });
        runningProcesses.add(this.process);
        
        const proc = this.process;
        this.process.stdout.on('data', (chunk) => this.output(chunk.toString('utf8')));
        
        // Custom parser for stderr to catch state markers
        let stderrBuffer = '';
        this.process.stderr.on('data', (chunk) => {
          stderrBuffer += chunk.toString('utf8');
          
          if (stderrBuffer.includes('MemoryError')) {
            this.output('\r\n[Memory limit exceeded: chương trình dùng quá nhiều bộ nhớ]\r\n');
            this.processKilledReason = 'MEMORY_LIMIT';
            this.killActiveProcess();
            return;
          }
          
          while (true) {
            let markerIndex = -1;
            let markerLen = 0;
            let nextState = null;
            
            const idxWaiting = stderrBuffer.indexOf('__SIMPLEOJ_WAITING_INPUT__');
            const idxRunning = stderrBuffer.indexOf('__SIMPLEOJ_RUNNING__');
            
            if (idxWaiting !== -1 && (idxRunning === -1 || idxWaiting < idxRunning)) {
              markerIndex = idxWaiting;
              markerLen = '__SIMPLEOJ_WAITING_INPUT__'.length;
              nextState = 'WAITING_INPUT';
            } else if (idxRunning !== -1) {
              markerIndex = idxRunning;
              markerLen = '__SIMPLEOJ_RUNNING__'.length;
              nextState = 'RUNNING';
            }
            
            if (markerIndex === -1) {
              // Extract safe prefix to output immediately to avoid holding normal stderr.
              // We reserve space for a potential partial marker at the end of buffer.
              let safeLen = stderrBuffer.length;
              const markerPrefix = '__SIMPLEOJ_';
              const lastPrefixIdx = stderrBuffer.lastIndexOf(markerPrefix);
              // Max length of any marker is 26 characters
              if (lastPrefixIdx !== -1 && lastPrefixIdx >= stderrBuffer.length - 30) {
                safeLen = lastPrefixIdx;
              }
              
              if (safeLen > 0) {
                this.output(stderrBuffer.slice(0, safeLen));
                stderrBuffer = stderrBuffer.slice(safeLen);
              }
              break;
            }
            
            // Output normal stderr prior to the marker
            if (markerIndex > 0) {
              this.output(stderrBuffer.slice(0, markerIndex));
            }
            
            // Transition state
            this.setProcessState(nextState);
            
            // Slice the buffer past the marker and any trailing newlines
            let endOfMarker = markerIndex + markerLen;
            stderrBuffer = stderrBuffer.slice(endOfMarker);
            if (stderrBuffer.startsWith('\r')) {
              stderrBuffer = stderrBuffer.slice(1);
            }
            if (stderrBuffer.startsWith('\n')) {
              stderrBuffer = stderrBuffer.slice(1);
            }
          }
        });

        this.process.on('error', (error) => {
          console.error('Python terminal process error:', error);
          this.output(`\r\n[Runner error: không thể khởi động môi trường chạy Python]\r\n`);
        });
        this.process.on('close', (code, signal) => {
          runningProcesses.delete(proc);
          if (stderrBuffer) {
            this.output(stderrBuffer);
          }
          if (!this.processKilledReason) {
            if (signal === 'SIGSEGV' || signal === 'SIGKILL' || code === 139 || code === 137) {
              this.output('\r\n[Memory limit exceeded: chương trình dùng quá nhiều bộ nhớ]\r\n');
            }
          }
          this.finishProcess(code);
        });
      } catch (error) {
        this.process = null;
        this.processKind = null;
        console.error('Failed to start python process in terminal:', error);
        this.output(`\r\n[Runner error: không thể khởi động môi trường chạy Python]\r\n`);
        sendJson(this.ws, { type: 'exit', code: 1 });
        return;
      }
    }

    sendJson(this.ws, { type: 'start', runtime: this.processKind });
    this.processKilledReason = null;

    if (mode === 'main.py') {
      // Initialize main.py process state
      this.processState = 'RUNNING';
      this.runningTimeLeft = config.pythonRunningTimeoutMs;
      this.lastRunningStartTime = Date.now();
      
      // Active CPU timeout for the initial running phase
      this.processActiveTimer = setTimeout(() => {
        this.output('\r\n[Time limit exceeded: chương trình chạy quá thời gian cho phép]\r\n');
        this.processKilledReason = 'TIMEOUT';
        this.interrupt();
      }, config.pythonRunningTimeoutMs);

      // Total lifetime timeout
      const totalMinutes = Math.floor(config.pythonTotalTimeoutMs / 60000);
      const totalSeconds = Math.floor((config.pythonTotalTimeoutMs % 60000) / 1000);
      const timeStr = totalMinutes > 0 ? `${totalMinutes} phút` : `${totalSeconds} giây`;
      this.processLifetimeTimer = setTimeout(() => {
        this.output(`\r\n[Chương trình đã quá thời lượng hoạt động tối đa ${timeStr}. Đang dừng...]\r\n`);
        this.processKilledReason = 'TIMEOUT';
        this.killActiveProcess();
      }, config.pythonTotalTimeoutMs);
    } else if (mode === '--repl') {
      this.resetReplIdleTimer();

      // REPL total lifetime: 5 minutes (300 seconds)
      this.replLifetimeTimer = setTimeout(() => {
        this.output('\r\n[REPL đã đạt giới hạn hoạt động tối đa 5 phút. Đang dừng...]\r\n');
        this.killActiveProcess();
      }, 300000);
      
      if (this.processKind === 'spawn') {
        this.output('\r\n# REPL đang ở chế độ basic (thiếu node-pty).\r\n');
      }
    }
  }

  setProcessState(newState) {
    if (this.closed || !this.process) return;
    if (this.processState === newState) return;
    
    // Clear state-specific timers
    clearTimeout(this.processActiveTimer);
    clearTimeout(this.processInputTimer);
    this.processActiveTimer = null;
    this.processInputTimer = null;
    
    if (newState === 'WAITING_INPUT') {
      // Calculate CPU time consumed during the RUNNING state
      const elapsed = Date.now() - this.lastRunningStartTime;
      this.runningTimeLeft = Math.max(0, this.runningTimeLeft - elapsed);
      this.processState = 'WAITING_INPUT';
      
      // Set input idle timeout
      this.processInputTimer = setTimeout(() => {
        this.output('\r\n[Input timeout: chương trình đã chờ nhập quá lâu]\r\n');
        this.processKilledReason = 'INPUT_TIMEOUT';
        this.killActiveProcess();
      }, config.pythonInputTimeoutMs);
    } 
    else if (newState === 'RUNNING') {
      this.processState = 'RUNNING';
      this.lastRunningStartTime = Date.now();
      
      // Set active CPU timeout for the remaining time
      const limit = Math.max(0, this.runningTimeLeft);
      this.processActiveTimer = setTimeout(() => {
        this.output('\r\n[Time limit exceeded: chương trình chạy quá thời gian cho phép]\r\n');
        this.processKilledReason = 'TIMEOUT';
        this.interrupt();
      }, limit);
    }
  }

  resetReplIdleTimer() {
    clearTimeout(this.replIdleTimer);
    this.replIdleTimer = setTimeout(() => {
      this.output('\r\n[REPL tự động đóng do không hoạt động trong 120 giây]\r\n');
      this.killActiveProcess();
    }, 120000); // 2 minutes idle timeout
  }

  async interrupt() {
    if (!this.process) return;
    this.output('^C\r\n');
    const proc = this.process;
    try {
      proc.kill('SIGINT');
    } catch (e) {}
    
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (e) {}
    }, 1000);
  }

  stopProcess(signal = 'SIGKILL') {
    if (!this.process) return;
    try { this.process.kill(signal); } catch { /* already exited */ }
  }

  async finishProcess(code = 0) {
    clearTimeout(this.processActiveTimer);
    clearTimeout(this.processInputTimer);
    clearTimeout(this.processLifetimeTimer);
    clearTimeout(this.replIdleTimer);
    clearTimeout(this.replLifetimeTimer);
    
    this.processActiveTimer = null;
    this.processInputTimer = null;
    this.processLifetimeTimer = null;
    this.replIdleTimer = null;
    this.replLifetimeTimer = null;
    
    const proc = this.process;
    this.process = null;
    this.processKind = null;
    if (proc) {
      runningProcesses.delete(proc);
    }

    if (this.workdir) {
      await fs.rm(path.join(this.workdir, 'main.py'), { force: true }).catch(() => {});
    }

    sendJson(this.ws, { type: 'exit', code });
  }

  async killActiveProcess() {
    if (!this.process) return;
    const proc = this.process;
    
    clearTimeout(this.processActiveTimer);
    clearTimeout(this.processInputTimer);
    clearTimeout(this.processLifetimeTimer);
    clearTimeout(this.replIdleTimer);
    clearTimeout(this.replLifetimeTimer);
    
    this.processActiveTimer = null;
    this.processInputTimer = null;
    this.processLifetimeTimer = null;
    this.replIdleTimer = null;
    this.replLifetimeTimer = null;
    
    this.process = null;
    this.processKind = null;
    
    runningProcesses.delete(proc);

    try { proc.kill('SIGINT'); } catch (e) {}
    
    await new Promise((resolve) => {
      const checkTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
        resolve();
      }, 1000);
      
      proc.once('close', () => {
        clearTimeout(checkTimer);
        resolve();
      });
      proc.once('exit', () => {
        clearTimeout(checkTimer);
        resolve();
      });
    });
  }

  async close(code, reason) {
    if (this.closed) return;
    this.closed = true;
    
    clearTimeout(this.idleTimer);
    clearTimeout(this.processActiveTimer);
    clearTimeout(this.processInputTimer);
    clearTimeout(this.processLifetimeTimer);
    clearTimeout(this.replIdleTimer);
    clearTimeout(this.replLifetimeTimer);
    
    const proc = this.process;
    this.stopProcess('SIGKILL');
    if (proc) {
      runningProcesses.delete(proc);
    }
    
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close(code, reason);
    if (this.workdir) {
      await fs.rm(this.workdir, { recursive: true, force: true }).catch(() => {});
      this.workdir = null;
    }
  }
  validateMessageSchema(message) {
    if (!message || typeof message !== 'object') return false;
    const validTypes = ['runFile', 'startRepl', 'stdin', 'interrupt', 'dispose'];
    if (!validTypes.includes(message.type)) return false;
    if (message.type === 'runFile' && typeof message.code !== 'string') return false;
    if (message.type === 'stdin' && typeof message.data !== 'string') return false;
    return true;
  }
}

export function attachTerminalServer(server) {
  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });

  server.on('upgrade', async (request, socket, head) => {
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { return rejectUpgrade(socket, '400 Bad Request', 'Bad request'); }
    if (pathname !== '/ws/terminal') return rejectUpgrade(socket, '404 Not Found', 'Not found');

    if (!config.serverTerminalEnabled || config.terminalRunner !== 'server') {
      return rejectUpgrade(socket, '403 Forbidden', 'Server-side terminal is disabled');
    }

    const user = await authenticate(request);
    if (!user) return rejectUpgrade(socket, '401 Unauthorized', 'Authentication required');

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit('connection', ws, request, user);
    });
  });

  wsServer.on('connection', async (ws, _request, user) => {
    const existingSession = activeSessions.get(user.id);
    if (existingSession) {
      await existingSession.close(4000, 'Phiên hoạt động mới đã được mở.').catch(() => {});
    }

    const session = new TerminalSession(ws, user);
    activeSessions.set(user.id, session);
    
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (activeSessions.get(user.id) === session) {
        activeSessions.delete(user.id);
      }
      session.close().catch(() => {});
    };
    
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!session.validateMessageSchema(msg)) {
          sendJson(ws, { type: 'error', message: '[Terminal protocol error]' });
          return;
        }
        session.handle(msg).catch((error) => {
          console.error('Terminal session handle error:', error);
          sendJson(ws, { type: 'error', message: 'Lỗi thực thi terminal.' });
        });
      } catch (err) {
        sendJson(ws, { type: 'error', message: '[Terminal protocol error]' });
      }
    });
    ws.on('close', release);
    ws.on('error', release);
    
    try {
      await session.start();
    } catch (error) {
      sendJson(ws, { type: 'error', message: `Không tạo được phiên terminal: ${error.message}` });
      release();
    }
  });

  return wsServer;
}
