import { Terminal } from '/vendor/xterm/lib/xterm.mjs';
import { FitAddon } from '/vendor/xterm-fit/lib/addon-fit.mjs';

const WS_OPEN = 1;

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

  let socket;
  let connected = false;
  let running = false;
  let runtime = null;
  let commandPending = false;
  let commandBuffer = '';
  let processInputBuffer = '';
  let history = [];
  let historyIndex = 0;
  let disposed = false;

  const send = (payload) => {
    if (socket?.readyState !== WS_OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  };

  const handleTerminalKeydown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && running && !terminal.hasSelection()) {
      event.preventDefault();
      event.stopPropagation();
      terminal.write('^C\r\n');
      send({ type: 'interrupt' });
    }
  };
  host.addEventListener('keydown', handleTerminalKeydown, true);

  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type === 'keydown' && event.ctrlKey && event.key.toLowerCase() === 'c' && running && !terminal.hasSelection()) {
      terminal.write('^C\r\n');
      send({ type: 'interrupt' });
      return false;
    }
    return true;
  });

  const fit = () => {
    if (disposed || !host.isConnected) return;
    try {
      fitAddon.fit();
    } catch { /* The host may be hidden while switching mobile panes. */ }
  };

  const replaceCurrentCommand = (next) => {
    while (commandBuffer.length) {
      terminal.write('\b \b');
      commandBuffer = commandBuffer.slice(0, -1);
    }
    commandBuffer = next;
    terminal.write(next);
  };

  const submitCommand = () => {
    const command = commandBuffer.trim().replace(/\s+/g, ' ');
    terminal.write('\r\n');
    commandBuffer = '';
    
    if (command) {
      history = [...history.filter((item) => item !== command), command].slice(-50);
      historyIndex = history.length;
    }

    if (command === 'help') {
      terminal.writeln('Các lệnh được phép:');
      terminal.writeln('  python main.py   Chạy code hiện tại trong editor');
      terminal.writeln('  python           Mở Python REPL interactive');
      terminal.writeln('  cat main.py      In code hiện tại trong editor');
      terminal.writeln('  clear / cls      Xóa terminal');
      terminal.writeln('  help             Hiện trợ giúp');
      terminal.write('$ ');
    } else if (command === 'clear' || command === 'cls') {
      terminal.clear();
      terminal.write('$ ');
    } else if (command === 'cat main.py') {
      const code = getCode();
      terminal.write(code + (code.endsWith('\n') ? '' : '\r\n'));
      terminal.write('$ ');
    } else if (command === 'python main.py') {
      running = true;
      commandPending = true;
      onRunningChange?.(true);
      if (!send({ type: 'runFile', code: getCode() })) {
        terminal.writeln('\x1b[31mMất kết nối tới terminal server.\x1b[0m');
        running = false;
        commandPending = false;
        onRunningChange?.(false);
        terminal.write('$ ');
      }
    } else if (command === 'python') {
      running = true;
      commandPending = true;
      onRunningChange?.(true);
      if (!send({ type: 'startRepl' })) {
        terminal.writeln('\x1b[31mMất kết nối tới terminal server.\x1b[0m');
        running = false;
        commandPending = false;
        onRunningChange?.(false);
        terminal.write('$ ');
      }
    } else if (command === '') {
      terminal.write('$ ');
    } else {
      terminal.writeln(`Lệnh không được phép: ${command}`);
      terminal.writeln('Gõ "help" để xem danh sách lệnh.');
      terminal.write('$ ');
    }
  };

  const handleShellData = (data) => {
    if (!connected || commandPending) return;
    if (data === '\r') return submitCommand();
    if (data === '\x03') { // Ctrl+C
      terminal.write('^C\r\n$ ');
      commandBuffer = '';
      return;
    }
    if (data === '\x7f') { // Backspace
      if (commandBuffer.length) {
        commandBuffer = commandBuffer.slice(0, -1);
        terminal.write('\b \b');
      }
      return;
    }
    if (data === '\x1b[A') { // Up arrow
      if (historyIndex > 0) historyIndex -= 1;
      return replaceCurrentCommand(history[historyIndex] || '');
    }
    if (data === '\x1b[B') { // Down arrow
      if (historyIndex < history.length) historyIndex += 1;
      return replaceCurrentCommand(history[historyIndex] || '');
    }
    if (data.startsWith('\x1b')) return;
    for (const char of data) {
      if (char === '\r' || char === '\n') submitCommand();
      else if (char >= ' ') {
        commandBuffer += char;
        terminal.write(char);
      }
    }
  };

  const handleFallbackInput = (data) => {
    if (data === '\x03') {
      terminal.write('^C\r\n');
      send({ type: 'interrupt' });
      return;
    }
    if (data === '\x7f') {
      if (processInputBuffer.length) {
        processInputBuffer = processInputBuffer.slice(0, -1);
        terminal.write('\b \b');
      }
      return;
    }
    for (const char of data) {
      if (char === '\r' || char === '\n') {
        terminal.write('\r\n');
        send({ type: 'stdin', data: `${processInputBuffer}\n` });
        processInputBuffer = '';
      } else if (char >= ' ') {
        processInputBuffer += char;
        terminal.write(char);
      }
    }
  };

  terminal.onData((data) => {
    if (running) {
      if (runtime === 'pty') {
        if (data === '\x03') send({ type: 'interrupt' });
        else send({ type: 'stdin', data });
      } else {
        handleFallbackInput(data);
      }
    } else {
      handleShellData(data);
    }
  });

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws/terminal`);
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    
    if (message.type === 'ready') {
      connected = true;
      terminal.writeln(`\x1b[90mSimpleOJ Terminal — Python 3. Gõ "help" để xem lệnh.\x1b[0m`);
      terminal.write('$ ');
      fit();
    } else if (message.type === 'start') {
      running = true;
      runtime = message.runtime || 'spawn';
      commandPending = true;
      processInputBuffer = '';
      onRunningChange?.(true);
    } else if (message.type === 'output') {
      terminal.write(message.data);
    } else if (message.type === 'exit') {
      running = false;
      runtime = null;
      commandPending = false;
      processInputBuffer = '';
      onRunningChange?.(false);
      terminal.write('$ ');
      terminal.focus();
    } else if (message.type === 'error') {
      terminal.writeln(`\x1b[31m${message.message}\x1b[0m`);
      running = false;
      runtime = null;
      commandPending = false;
      processInputBuffer = '';
      onRunningChange?.(false);
      terminal.write('$ ');
      terminal.focus();
    }
  });
  
  socket.addEventListener('close', (event) => {
    connected = false;
    running = false;
    onRunningChange?.(false);
    if (!disposed) {
      if (event.reason === 'Session expired' || (event.code === 1000 && String(event.reason || '').toLowerCase().includes('expired'))) {
        terminal.write('\r\n\x1b[31m[Session expired. Please reconnect.]\x1b[0m\r\n');
      } else {
        terminal.write('\r\n\x1b[31m[Terminal disconnected. Please reload the page.]\x1b[0m\r\n');
      }
    }
  });
  socket.addEventListener('error', () => {
    if (!disposed) terminal.write('\r\n\x1b[31mKhông kết nối được /ws/terminal.\x1b[0m\r\n');
  });

  const resizeObserver = new ResizeObserver(() => requestAnimationFrame(fit));
  resizeObserver.observe(host);
  requestAnimationFrame(fit);

  return {
    execute(command) {
      if (!connected || running || commandPending) return false;
      replaceCurrentCommand(command);
      submitCommand();
      return true;
    },
    focus() { terminal.focus(); },
    fit,
    interrupt() {
      if (!running) return false;
      terminal.write('^C\r\n');
      return send({ type: 'interrupt' });
    },
    notice(text, color = '90') { terminal.write(`\r\n\x1b[${color}m${text}\x1b[0m\r\n`); },
    dispose() {
      disposed = true;
      resizeObserver.disconnect();
      host.removeEventListener('keydown', handleTerminalKeydown, true);
      send({ type: 'dispose' });
      socket?.close();
      terminal.dispose();
    }
  };
}
