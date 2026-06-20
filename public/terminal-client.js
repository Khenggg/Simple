import { Terminal } from '/vendor/xterm/lib/xterm.mjs';
import { FitAddon } from '/vendor/xterm-fit/lib/addon-fit.mjs';

// --- Pyodide Web Worker Manager ---
let pyodideWorker = null;
let pyodideState = 'idle'; // 'idle' | 'loading' | 'ready' | 'failed' | 'running' | 'waiting_input'
let sharedBuffer = null;
let statusInt32 = null;
let inputData = null;
let interruptBuffer = null;
let onReadyCallbacks = [];
let workerTimeoutTimer = null;
let activeRun = null; // { onStdout, onExit, onWaitingInput, startTime, type: 'file' | 'repl' }

export const PyodideManager = {
  getState() {
    return pyodideState;
  },

  preload() {
    if (pyodideState !== 'idle') return;

    const isSupported = window.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined';
    if (!isSupported) {
      pyodideState = 'failed';
      return;
    }

    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => this.init());
    } else {
      setTimeout(() => this.init(), 2000);
    }
  },

  init() {
    if (pyodideState !== 'idle' && pyodideState !== 'failed') {
      return new Promise((resolve) => {
        if (pyodideState === 'ready') resolve(true);
        else onReadyCallbacks.push(resolve);
      });
    }

    pyodideState = 'loading';
    this.notifyStateChange();

    return new Promise((resolve) => {
      try {
        sharedBuffer = new SharedArrayBuffer(64 * 1024 + 8);
        statusInt32 = new Int32Array(sharedBuffer, 0, 2);
        inputData = new Uint8Array(sharedBuffer, 8);
        interruptBuffer = new Int32Array(new SharedArrayBuffer(4));

        pyodideWorker = new Worker('/pyodide-worker.js');

        pyodideWorker.postMessage({
          type: 'init',
          sharedBuffer,
          interruptBuffer
        });

        pyodideWorker.onmessage = (e) => {
          const msg = e.data;

          if (msg.type === 'ready') {
            pyodideState = 'ready';
            this.notifyStateChange();
            resolve(true);
            const callbacks = onReadyCallbacks;
            onReadyCallbacks = [];
            callbacks.forEach(cb => cb(true));
          }

          else if (msg.type === 'failed') {
            pyodideState = 'failed';
            this.notifyStateChange();
            this.terminate();
            resolve(false);
            const callbacks = onReadyCallbacks;
            onReadyCallbacks = [];
            callbacks.forEach(cb => cb(false));
          }

          else if (msg.type === 'stdout') {
            if (activeRun?.onStdout) {
              activeRun.onStdout(msg.text);
            }
          }

          else if (msg.type === 'waiting_input') {
            pyodideState = 'waiting_input';
            this.notifyStateChange();

            this.clearTimers();
            // Input timeout: 120s
            workerTimeoutTimer = setTimeout(() => {
              this.handleTimeout('input_timeout');
            }, 120000);

            if (activeRun?.onWaitingInput) {
              activeRun.onWaitingInput(msg.prompt);
            }
          }

          else if (msg.type === 'exit') {
            this.clearTimers();
            pyodideState = 'ready';
            this.notifyStateChange();
            if (activeRun?.onExit) {
              activeRun.onExit({ code: msg.code, error: msg.error, interrupted: msg.interrupted });
            }
            activeRun = null;
          }

          else if (msg.type === 'output_limit') {
            this.clearTimers();
            this.handleTimeout('output_limit');
          }

          else if (msg.type === 'input_timeout') {
            this.clearTimers();
            this.handleTimeout('input_timeout');
          }
        };

        pyodideWorker.onerror = (err) => {
          console.error("Worker error:", err);
          pyodideState = 'failed';
          this.notifyStateChange();
          this.terminate();
          resolve(false);
          const callbacks = onReadyCallbacks;
          onReadyCallbacks = [];
          callbacks.forEach(cb => cb(false));
        };

      } catch (err) {
        console.error("Failed to spawn Worker:", err);
        pyodideState = 'failed';
        this.notifyStateChange();
        resolve(false);
      }
    });
  },

  notifyStateChange() {
    window.dispatchEvent(new CustomEvent('pyodide-state-change', { detail: { state: pyodideState } }));
  },

  clearTimers() {
    if (workerTimeoutTimer) {
      clearTimeout(workerTimeoutTimer);
      workerTimeoutTimer = null;
    }
  },

  handleTimeout(reason) {
    this.clearTimers();
    this.terminate();
    pyodideState = 'failed';
    this.notifyStateChange();

    if (activeRun?.onExit) {
      if (reason === 'running_timeout') {
        activeRun.onExit({ code: 1, error: 'TIMEOUT', timeout: 'running' });
      } else if (reason === 'input_timeout') {
        activeRun.onExit({ code: 1, error: 'TIMEOUT', timeout: 'input' });
      } else if (reason === 'output_limit') {
        activeRun.onExit({ code: 1, error: 'OUTPUT_LIMIT' });
      }
    }
    activeRun = null;
  },

  runCode(code, onStdout, onExit, onWaitingInput, type = 'file') {
    if (pyodideState !== 'ready') {
      return false;
    }

    pyodideState = 'running';
    this.notifyStateChange();

    activeRun = {
      onStdout,
      onExit,
      onWaitingInput,
      startTime: Date.now(),
      type
    };

    if (interruptBuffer) {
      interruptBuffer[0] = 0;
    }

    pyodideWorker.postMessage({
      type: type === 'repl' ? 'repl' : 'run',
      code
    });

    this.clearTimers();

    // running timeout (10 seconds for script, 30 seconds for REPL)
    const timeoutVal = type === 'file' ? 10000 : 30000;
    workerTimeoutTimer = setTimeout(() => {
      this.handleTimeout('running_timeout');
    }, timeoutVal);

    return true;
  },

  submitInput(text) {
    if (pyodideState !== 'waiting_input') return;

    this.clearTimers();

    const encoder = new TextEncoder();
    const encoded = encoder.encode(text);
    const maxLength = Math.min(encoded.length, 64 * 1024);

    inputData.set(encoded.subarray(0, maxLength));
    Atomics.store(statusInt32, 1, maxLength);
    Atomics.store(statusInt32, 0, 1);
    Atomics.notify(statusInt32, 0);

    pyodideState = 'running';
    this.notifyStateChange();

    const timeoutVal = activeRun?.type === 'file' ? 10000 : 30000;
    workerTimeoutTimer = setTimeout(() => {
      this.handleTimeout('running_timeout');
    }, timeoutVal);
  },

  interrupt() {
    if (pyodideState === 'waiting_input') {
      this.clearTimers();
      Atomics.store(statusInt32, 0, 2);
      Atomics.notify(statusInt32, 0);
      return true;
    }

    if (pyodideState === 'running') {
      if (interruptBuffer) {
        interruptBuffer[0] = 2; // SIGINT
      }

      // Hard terminate fallback
      setTimeout(() => {
        if (pyodideState === 'running' || pyodideState === 'waiting_input') {
          this.terminate();
          pyodideState = 'failed';
          this.notifyStateChange();
          if (activeRun?.onExit) {
            activeRun.onExit({ code: 130, interrupted: true });
          }
          activeRun = null;
        }
      }, 2000);

      return true;
    }

    return false;
  },

  terminate() {
    this.clearTimers();
    if (pyodideWorker) {
      pyodideWorker.terminate();
      pyodideWorker = null;
    }
    sharedBuffer = null;
    statusInt32 = null;
    inputData = null;
    interruptBuffer = null;
    activeRun = null;
    pyodideState = 'idle';
    this.notifyStateChange();
  }
};

export function createTerminalController({ host, getCode, onRunningChange }) {
  const terminal = new Terminal({
    allowProposedApi: false,
    convertEol: true,
    cursorBlink: true,
    cursorStyle: 'bar',
    fontFamily: 'Consolas, "DM Mono", monospace',
    fontSize: window.innerWidth <= 760 ? 12 : 13,
    lineHeight: 1.35,
    scrollback: 1500,
    theme: {
      background: '#ffffff', foreground: '#17211c', cursor: '#17211c', cursorAccent: '#ffffff',
      selectionBackground: '#b9d7f6', black: '#ffffff', red: '#b43b31', green: '#174b3a',
      yellow: '#f6c85f', blue: '#356f9f', magenta: '#7f0055', cyan: '#236a51', white: '#ffffff',
      brightBlack: '#6f786f', brightRed: '#b43b31', brightGreen: '#236a51', brightYellow: '#f6c85f',
      brightBlue: '#356f9f', brightMagenta: '#7f0055', brightCyan: '#236a51', brightWhite: '#ffffff'
    }
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(host);

  const isSupported = window.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined';
  
  let disposed = false;
  let running = false;
  let replMode = false;
  let commandPending = false;

  // History & Readline states
  let currentLine = '';
  let cursorIndex = 0;
  let history = [];
  let historyIndex = 0;
  
  // States: 'COMMAND' | 'LOADING' | 'RUNNING' | 'WAITING_INPUT' | 'REPL' | 'FAILED'
  let terminalState = 'COMMAND';
  let activePrompt = '$ ';
  let compositionActive = false;

  const fit = () => {
    if (disposed || !host.isConnected) return;
    try {
      fitAddon.fit();
    } catch { /* hidden mobile pane */ }
  };

  const resizeObserver = new ResizeObserver(() => requestAnimationFrame(fit));
  resizeObserver.observe(host);
  requestAnimationFrame(fit);

  // Focus and Composition Event Listeners for Mobile Compatibility
  const textarea = host.querySelector('.xterm-helper-textarea');
  if (textarea) {
    textarea.addEventListener('compositionstart', () => {
      compositionActive = true;
    });
    textarea.addEventListener('compositionend', (e) => {
      compositionActive = false;
    });
  }

  // Ensure touching terminal focuses input
  const handleTerminalFocus = () => {
    if (!disposed) terminal.focus();
  };
  host.addEventListener('click', handleTerminalFocus);
  host.addEventListener('touchstart', handleTerminalFocus);

  // Helper to get length of string without ANSI escape sequences
  const getVisibleLength = (str) => {
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').length;
  };

  // Redraw line buffer on terminal screen
  const draw = () => {
    if (terminalState === 'RUNNING' || terminalState === 'LOADING') return;
    const prompt = activePrompt;
    const line = currentLine;
    const cursor = cursorIndex;
    const promptLength = getVisibleLength(prompt);
    terminal.write('\r' + prompt + line + '\x1b[K' + `\x1b[${promptLength + cursor + 1}G`);
  };

  const setLine = (text) => {
    currentLine = text;
    cursorIndex = text.length;
    draw();
  };

  const insertText = (text) => {
    if (text.includes('\r') || text.includes('\n')) {
      text = text.split(/\r?\n/)[0];
    }
    currentLine = currentLine.slice(0, cursorIndex) + text + currentLine.slice(cursorIndex);
    cursorIndex += text.length;
    draw();
  };

  const handleBackspace = () => {
    if (cursorIndex > 0) {
      currentLine = currentLine.slice(0, cursorIndex - 1) + currentLine.slice(cursorIndex);
      cursorIndex--;
      draw();
    }
  };

  const handleDelete = () => {
    if (cursorIndex < currentLine.length) {
      currentLine = currentLine.slice(0, cursorIndex) + currentLine.slice(cursorIndex + 1);
      draw();
    }
  };

  const moveCursorLeft = () => {
    if (cursorIndex > 0) {
      cursorIndex--;
      draw();
    }
  };

  const moveCursorRight = () => {
    if (cursorIndex < currentLine.length) {
      cursorIndex++;
      draw();
    }
  };

  const moveCursorHome = () => {
    cursorIndex = 0;
    draw();
  };

  const moveCursorEnd = () => {
    cursorIndex = currentLine.length;
    draw();
  };

  const clearFromStartToCursor = () => {
    currentLine = currentLine.slice(cursorIndex);
    cursorIndex = 0;
    draw();
  };

  const clearFromCursorToEnd = () => {
    currentLine = currentLine.slice(0, cursorIndex);
    draw();
  };

  const handleHistoryUp = () => {
    if (terminalState === 'COMMAND' || terminalState === 'REPL') {
      if (historyIndex > 0) {
        historyIndex--;
        setLine(history[historyIndex] || '');
      }
    }
  };

  const handleHistoryDown = () => {
    if (terminalState === 'COMMAND' || terminalState === 'REPL') {
      if (historyIndex < history.length) {
        historyIndex++;
        setLine(history[historyIndex] || '');
      }
    }
  };

  const handleCtrlC = () => {
    terminal.write('^C\r\n');
    currentLine = '';
    cursorIndex = 0;
    
    if (running || terminalState === 'RUNNING' || terminalState === 'WAITING_INPUT') {
      PyodideManager.interrupt();
    }
    
    running = false;
    commandPending = false;
    onRunningChange?.(false);

    if (replMode) {
      terminalState = 'REPL';
      activePrompt = '>>> ';
    } else {
      terminalState = 'COMMAND';
      activePrompt = '$ ';
    }
    
    terminal.write(activePrompt);
  };

  const handleEnter = () => {
    const line = currentLine;
    terminal.write('\r\n');
    currentLine = '';
    cursorIndex = 0;

    if (terminalState === 'COMMAND') {
      submitCommand(line);
    } else if (terminalState === 'REPL') {
      submitReplLine(line);
    } else if (terminalState === 'WAITING_INPUT') {
      terminalState = 'RUNNING';
      onRunningChange?.(true);
      PyodideManager.submitInput(line + '\n');
    }
  };

  const submitCommand = (cmdText) => {
    const cmd = cmdText.trim().replace(/\s+/g, ' ');

    if (cmd) {
      history = [...history.filter((item) => item !== cmd), cmd].slice(-50);
      historyIndex = history.length;
    }

    if (cmd === 'help') {
      terminal.writeln('Các lệnh được phép:');
      terminal.writeln('  python main.py   Chạy code hiện tại trong editor');
      terminal.writeln('  python           Mở Python REPL interactive (Basic Mode)');
      terminal.writeln('  cat main.py      In code hiện tại trong editor');
      terminal.writeln('  clear / cls      Xóa terminal');
      terminal.writeln('  retry            Tải lại Python runtime');
      terminal.writeln('  help             Hiện trợ giúp');
      terminal.write(activePrompt);
    } else if (cmd === 'clear' || cmd === 'cls') {
      terminal.clear();
      terminal.write(activePrompt);
    } else if (cmd === 'cat main.py') {
      const code = getCode();
      terminal.write(code + (code.endsWith('\n') ? '' : '\r\n'));
      terminal.write(activePrompt);
    } else if (cmd === 'python main.py') {
      runCode(getCode(), 'file');
    } else if (cmd === 'python') {
      const state = PyodideManager.getState();
      const enterRepl = () => {
        replMode = true;
        terminalState = 'REPL';
        activePrompt = '>>> ';
        terminal.writeln('\x1b[90mPython 3 REPL (Basic Mode). Gõ exit() hoặc quit() để thoát.\x1b[0m');
        terminal.write(activePrompt);
      };
      
      if (state === 'ready') {
        enterRepl();
      } else {
        terminalState = 'LOADING';
        terminal.writeln('[Đang tải Python runtime... lần đầu có thể mất vài giây]');
        PyodideManager.init().then((success) => {
          if (success) {
            terminal.writeln('[Python runtime đã sẵn sàng]');
            enterRepl();
          } else {
            terminalState = 'FAILED';
            terminal.writeln('\x1b[31m[Không thể tải Python runtime từ CDN. Kiểm tra mạng hoặc gõ retry để thử lại.]\x1b[0m');
            activePrompt = '$ ';
            terminal.write(activePrompt);
          }
        });
      }
    } else if (cmd === 'retry') {
      terminalState = 'LOADING';
      terminal.writeln('[Đang tải lại Python runtime...]');
      PyodideManager.terminate();
      PyodideManager.init().then((success) => {
        if (success) {
          terminal.writeln('[Python runtime đã sẵn sàng]');
          if (replMode) {
            terminalState = 'REPL';
            activePrompt = '>>> ';
          } else {
            terminalState = 'COMMAND';
            activePrompt = '$ ';
          }
        } else {
          terminalState = 'FAILED';
          terminal.writeln('\x1b[31m[Không thể tải Python runtime từ CDN. Kiểm tra mạng hoặc gõ retry để thử lại.]\x1b[0m');
          if (replMode) {
            terminalState = 'REPL';
            activePrompt = '>>> ';
          } else {
            terminalState = 'COMMAND';
            activePrompt = '$ ';
          }
        }
        terminal.write(activePrompt);
      });
    } else if (cmd === '') {
      terminal.write(activePrompt);
    } else {
      terminal.writeln(`Lệnh không được phép: ${cmd}`);
      terminal.writeln('Gõ "help" để xem danh sách lệnh.');
      terminal.write(activePrompt);
    }
  };

  const submitReplLine = (line) => {
    if (line.trim() === 'exit()' || line.trim() === 'quit()') {
      replMode = false;
      terminalState = 'COMMAND';
      activePrompt = '$ ';
      terminal.write(activePrompt);
      return;
    }

    if (line.trim()) {
      history = [...history.filter((item) => item !== line), line].slice(-50);
      historyIndex = history.length;
    }

    runCode(line, 'repl');
  };

  const handleRunExit = (res) => {
    running = false;
    commandPending = false;
    onRunningChange?.(false);
    
    if (res.error) {
      if (res.error === 'TIMEOUT') {
        if (res.timeout === 'input') {
          terminal.writeln(`\r\n\x1b[31m[Input timeout: chương trình đã chờ nhập quá lâu]\x1b[0m`);
        } else {
          terminal.writeln(`\r\n\x1b[31m[Time limit exceeded: chương trình chạy quá thời gian cho phép]\x1b[0m`);
        }
      } else if (res.error === 'OUTPUT_LIMIT') {
        terminal.writeln(`\r\n\x1b[31m[Output limit exceeded: chương trình in quá nhiều dữ liệu]\x1b[0m`);
      } else {
        terminal.writeln(`\r\n\x1b[31m[Runner error: ${res.error}]\x1b[0m`);
      }
    } else if (res.interrupted) {
      // already printed ^C
    }
    
    if (replMode) {
      terminalState = 'REPL';
      activePrompt = '>>> ';
    } else {
      terminalState = 'COMMAND';
      activePrompt = '$ ';
    }
    
    terminal.write(activePrompt);
    terminal.focus();
  };

  const runCode = (code, type = 'file') => {
    running = true;
    commandPending = true;
    terminalState = 'RUNNING';
    onRunningChange?.(true);

    const state = PyodideManager.getState();
    
    const startRun = () => {
      PyodideManager.runCode(
        code,
        (text) => terminal.write(text.replace(/\r?\n/g, '\r\n')),
        handleRunExit,
        (promptText) => {
          terminalState = 'WAITING_INPUT';
          activePrompt = promptText ? (promptText.includes('\n') ? promptText.substring(promptText.lastIndexOf('\n') + 1) : promptText) : '';
          running = true;
          draw();
        },
        type
      );
    };

    if (state === 'ready') {
      startRun();
    } else if (state === 'loading' || state === 'idle') {
      terminalState = 'LOADING';
      terminal.writeln('[Đang tải Python runtime... lần đầu có thể mất vài giây]');
      PyodideManager.init().then((success) => {
        if (success) {
          terminal.writeln('[Python runtime đã sẵn sàng]');
          terminalState = 'RUNNING';
          startRun();
        } else {
          terminalState = 'FAILED';
          terminal.writeln('\x1b[31m[Không thể tải Python runtime từ CDN. Kiểm tra mạng hoặc gõ retry để thử lại.]\x1b[0m');
          running = false;
          commandPending = false;
          onRunningChange?.(false);
          if (replMode) {
            terminalState = 'REPL';
            activePrompt = '>>> ';
          } else {
            terminalState = 'COMMAND';
            activePrompt = '$ ';
          }
          terminal.write(activePrompt);
        }
      });
    } else {
      terminalState = 'FAILED';
      terminal.writeln('\x1b[31m[Không thể tải Python runtime từ CDN. Kiểm tra mạng hoặc gõ retry để thử lại.]\x1b[0m');
      running = false;
      commandPending = false;
      onRunningChange?.(false);
      if (replMode) {
        terminalState = 'REPL';
        activePrompt = '>>> ';
      } else {
        terminalState = 'COMMAND';
        activePrompt = '$ ';
      }
      terminal.write(activePrompt);
    }
  };

  if (!isSupported) {
    terminal.writeln(`\x1b[31m[Trình duyệt hiện không hỗ trợ Terminal tương tác. Bạn vẫn có thể Submit để chấm trên server.]\x1b[0m`);
    terminal.write('$ ');
    
    const handleUnsupportedShell = (data) => {
      if (data === '\r' || data === '\n') {
        const cmd = currentLine.trim().replace(/\s+/g, ' ');
        terminal.write('\r\n');
        currentLine = '';
        if (cmd === 'help') {
          terminal.writeln('Các lệnh được phép:');
          terminal.writeln('  cat main.py      In code hiện tại trong editor');
          terminal.writeln('  clear / cls      Xóa terminal');
          terminal.writeln('  help             Hiện trợ giúp');
          terminal.write('$ ');
        } else if (cmd === 'clear' || cmd === 'cls') {
          terminal.clear();
          terminal.write('$ ');
        } else if (cmd === 'cat main.py') {
          const code = getCode();
          terminal.write(code + (code.endsWith('\n') ? '' : '\r\n'));
          terminal.write('$ ');
        } else if (cmd === 'python' || cmd === 'python main.py') {
          terminal.writeln('\x1b[31m[Thiết bị/trình duyệt này không hỗ trợ Terminal tương tác. Bạn vẫn có thể bấm Submit để chấm trên server.]\x1b[0m');
          terminal.write('$ ');
        } else if (cmd === '') {
          terminal.write('$ ');
        } else {
          terminal.writeln(`Lệnh không được phép: ${cmd}`);
          terminal.writeln('Gõ "help" để xem danh sách lệnh.');
          terminal.write('$ ');
        }
        return;
      }
      if (data === '\x7f' || data === '\x08') {
        if (currentLine.length) {
          currentLine = currentLine.slice(0, -1);
          terminal.write('\b \b');
        }
        return;
      }
      for (const char of data) {
        if (char >= ' ') {
          currentLine += char;
          terminal.write(char);
        }
      }
    };

    terminal.onData(handleUnsupportedShell);

    return {
      execute(cmd) { return false; },
      focus() { terminal.focus(); },
      fit,
      interrupt() { return false; },
      notice(text, color = '90') { terminal.write(`\r\n\x1b[${color}m${text}\x1b[0m\r\n`); },
      dispose() {
        disposed = true;
        resizeObserver.disconnect();
        host.removeEventListener('click', handleTerminalFocus);
        host.removeEventListener('touchstart', handleTerminalFocus);
        terminal.dispose();
      }
    };
  }

  // Set initial terminal state
  terminalState = 'COMMAND';
  activePrompt = '$ ';
  terminal.writeln('\x1b[90mSimpleOJ Terminal — Python 3 (Client-side). Gõ "help" để xem lệnh.\x1b[0m');
  terminal.write(activePrompt);

  // Handle keys and paste inside onData
  terminal.onData((data) => {
    if (disposed) return;
    
    // Ignore keys during execution, except Ctrl+C
    if (terminalState === 'RUNNING' || terminalState === 'LOADING') {
      if (data === '\x03') {
        handleCtrlC();
      }
      return;
    }

    if (compositionActive) {
      return;
    }

    if (data === '\r' || data === '\n') {
      handleEnter();
      return;
    }
    if (data === '\x03') {
      handleCtrlC();
      return;
    }
    if (data === '\x7f' || data === '\x08') {
      handleBackspace();
      return;
    }
    if (data === '\x1b[D') {
      moveCursorLeft();
      return;
    }
    if (data === '\x1b[C') {
      moveCursorRight();
      return;
    }
    if (data === '\x1b[A') {
      handleHistoryUp();
      return;
    }
    if (data === '\x1b[B') {
      handleHistoryDown();
      return;
    }
    if (data === '\x1b[H' || data === '\x1b[1~') {
      moveCursorHome();
      return;
    }
    if (data === '\x1b[F' || data === '\x1b[4~') {
      moveCursorEnd();
      return;
    }
    if (data === '\x1b[3~') {
      handleDelete();
      return;
    }
    if (data === '\x04') {
      handleDelete();
      return;
    }
    if (data.startsWith('\x1b')) {
      return;
    }

    for (const char of data) {
      if (char >= ' ') {
        insertText(char);
      }
    }
  });

  const handleTerminalKeydown = (event) => {
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === 'a' || key === 'e' || key === 'u' || key === 'k' || key === 'c') {
        if (key === 'c' && terminal.hasSelection()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        
        if (key === 'c') {
          handleCtrlC();
        } else if (key === 'a') {
          moveCursorHome();
        } else if (key === 'e') {
          moveCursorEnd();
        } else if (key === 'u') {
          clearFromStartToCursor();
        } else if (key === 'k') {
          clearFromCursorToEnd();
        }
      }
    }
  };
  host.addEventListener('keydown', handleTerminalKeydown, true);

  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type === 'keydown' && event.ctrlKey && event.key.toLowerCase() === 'c') {
      if (running || terminalState === 'RUNNING' || terminalState === 'WAITING_INPUT') {
        handleCtrlC();
        return false;
      }
    }
    return true;
  });

  onRunningChange?.(false);

  return {
    execute(cmd) {
      if (running || commandPending || terminalState === 'RUNNING' || terminalState === 'LOADING') return false;
      setLine(cmd);
      handleEnter();
      return true;
    },
    focus() { terminal.focus(); },
    fit,
    interrupt() {
      if (!running && terminalState !== 'RUNNING' && terminalState !== 'WAITING_INPUT') return false;
      handleCtrlC();
      return true;
    },
    notice(text, color = '90') { terminal.write(`\r\n\x1b[${color}m${text}\x1b[0m\r\n`); },
    dispose() {
      disposed = true;
      resizeObserver.disconnect();
      host.removeEventListener('keydown', handleTerminalKeydown, true);
      host.removeEventListener('click', handleTerminalFocus);
      host.removeEventListener('touchstart', handleTerminalFocus);
      if (running) {
        PyodideManager.interrupt();
      }
      terminal.dispose();
    }
  };
}
