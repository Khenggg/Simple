import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const runnerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'python-runner.py');

function normalizeOutput(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

export async function runPythonLocal(code, input, limitMs = 1500) {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'simpleoj-'));
  const dropPrivileges = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() === 0;
  if (dropPrivileges) await fs.chown(workdir, 65534, 65534);
  return new Promise((resolve) => {
    const child = spawn(config.pythonCommand, ['-I', runnerPath], {
      cwd: workdir,
      env: { PYTHONIOENCODING: 'utf-8', PATH: process.env.PATH || '' },
      ...(dropPrivileges ? { uid: 65534, gid: 65534 } : {}),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.rm(workdir, { recursive: true, force: true }).catch(() => {}).finally(() => resolve(result));
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ output: '', error: `Quá thời gian chạy (${limitMs} ms).`, timedOut: true });
    }, limitMs + 400);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 50000) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      console.error('Python runner spawn failed:', error);
      finish({ output: '', error: 'Runner error: không thể khởi động môi trường chạy Python' });
    });
    child.on('close', () => {
      if (settled) return;
      try {
        finish(JSON.parse(stdout));
      } catch (err) {
        console.error('Python runner did not return valid JSON. stderr:', stderr, 'error:', err);
        finish({ output: '', error: 'Runner error: không thể khởi động môi trường chạy Python' });
      }
    });
    child.stdin.end(JSON.stringify({ code, input, limitMs }));
  });
}

async function runRemote(code, testcases, limitMs) {
  const response = await fetch(`${config.judgeServiceUrl.replace(/\/$/, '')}/internal/judge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.judgeServiceToken}` },
    body: JSON.stringify({ code, testcases, limitMs }),
    signal: AbortSignal.timeout(Math.max(10000, testcases.length * (limitMs + 1000)))
  });
  if (!response.ok) throw new Error(`Judge service trả về ${response.status}`);
  return response.json();
}

export function parseRunnerError(result, limitMs) {
  if (result.timedOut) {
    return {
      type: 'TIME_LIMIT_EXCEEDED',
      status: 'Time Limit Exceeded',
      message: 'chương trình chạy quá thời gian cho phép',
      traceback: '',
      line: null,
      safeForUser: true
    };
  }

  if (result.truncated) {
    return {
      type: 'OUTPUT_LIMIT_EXCEEDED',
      status: 'Output Limit Exceeded',
      message: 'chương trình in quá nhiều dữ liệu',
      traceback: '',
      line: null,
      safeForUser: true
    };
  }

  if (result.error) {
    const errStr = String(result.error);
    
    if (errStr.includes('[Blocked import:')) {
      const match = errStr.match(/\[Blocked import:\s*([^\]]+)\]/);
      const mod = match ? match[1] : '';
      return {
        type: 'BLOCKED_IMPORT_OR_OPERATION',
        status: 'Runtime Error',
        message: `Blocked import: ${mod}. Module này không được phép trong môi trường SimpleOJ.`,
        traceback: errStr,
        line: null,
        safeForUser: true
      };
    }

    if (errStr.includes('EOFError')) {
      return {
        type: 'USER_CODE_INPUT_ERROR',
        status: 'Runtime Error',
        message: 'chương trình đã đọc quá nhiều dữ liệu đầu vào hoặc testcase thiếu input',
        traceback: errStr,
        line: getLineNumberFromTraceback(errStr),
        safeForUser: true
      };
    }

    if (errStr.includes('MemoryError')) {
      return {
        type: 'MEMORY_LIMIT_EXCEEDED',
        status: 'Memory Limit Exceeded',
        message: 'chương trình dùng quá nhiều bộ nhớ',
        traceback: errStr,
        line: getLineNumberFromTraceback(errStr),
        safeForUser: true
      };
    }

    if (errStr.includes('SyntaxError') || errStr.includes('IndentationError') || errStr.includes('TabError')) {
      return {
        type: 'USER_CODE_SYNTAX_ERROR',
        status: 'Runtime Error',
        message: getErrorMessage(errStr),
        traceback: errStr,
        line: getLineNumberFromTraceback(errStr),
        safeForUser: true
      };
    }

    if (errStr.includes('Runner error:')) {
      return {
        type: 'RUNNER_SYSTEM_ERROR',
        status: 'Runtime Error',
        message: 'Runner error: không thể khởi động môi trường chạy Python',
        traceback: errStr,
        line: null,
        safeForUser: false
      };
    }

    return {
      type: 'USER_CODE_RUNTIME_ERROR',
      status: 'Runtime Error',
      message: getErrorMessage(errStr),
      traceback: errStr,
      line: getLineNumberFromTraceback(errStr),
      safeForUser: true
    };
  }

  return null;
}

function getLineNumberFromTraceback(tracebackStr) {
  const match = tracebackStr.match(/File\s+"(?:submission\.py|main\.py)",\s+line\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function getErrorMessage(tracebackStr) {
  const lines = tracebackStr.trim().split('\n');
  return lines[lines.length - 1] || 'Lỗi thực thi chương trình.';
}

export async function judgeSubmission(code, testcases, limitMs = 1500, forceLocal = false) {
  if (config.judgeServiceUrl && !forceLocal) return runRemote(code, testcases, limitMs);
  const reports = [];
  let passed = 0;
  for (let index = 0; index < testcases.length; index += 1) {
    const testcase = testcases[index];
    const result = await runPythonLocal(code, testcase.input, limitMs);
    const actual = normalizeOutput(result.output);
    const expected = normalizeOutput(testcase.output);
    
    const errorModel = parseRunnerError(result, limitMs);
    const ok = !errorModel && actual === expected;
    if (ok) passed += 1;
    
    const reportItem = {
      index: index + 1,
      passed: ok,
    };

    if (!ok) {
      if (errorModel) {
        reportItem.status = errorModel.status;
        reportItem.errorType = errorModel.type;
        reportItem.error = errorModel.safeForUser 
          ? `${errorModel.status}: ${errorModel.message}${errorModel.line ? ` (dòng ${errorModel.line})` : ''}` 
          : 'Runner error: không thể khởi động môi trường chạy Python';
        
        if (errorModel.type === 'RUNNER_SYSTEM_ERROR') {
          console.error(`[SYSTEM_ERROR] Testcase ${index + 1} failed:`, errorModel.traceback);
        }
      } else {
        reportItem.status = 'Wrong Answer';
        reportItem.error = 'Sai đáp án (Wrong Answer)';
      }
    } else {
      reportItem.status = 'Accepted';
      reportItem.error = 'Khớp đáp án';
    }
    
    reports.push(reportItem);
  }
  const total = testcases.length;
  return { passed, total, score: total ? Math.round((passed / total) * 100) : 0, reports };
}
