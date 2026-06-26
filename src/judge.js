import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const runnerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'python-runner.py');

function normalizeOutput(value) {
  return String(value ?? '').replace(/\r\n/g, '\n');
}

export async function runPythonLocal(code, input, limitMs = 1500, suppressInputPrompts = true) {
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
    child.stdin.end(JSON.stringify({ code, input, limitMs, suppressInputPrompts }));
  });
}

async function runRemote(code, testcases, limitMs, options = {}) {
  const response = await fetch(`${config.judgeServiceUrl.replace(/\/$/, '')}/internal/judge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.judgeServiceToken}` },
    body: JSON.stringify({
      code,
      testcases,
      limitMs,
      options: {
        ...options,
        suppressInputPrompts: options.suppressInputPrompts !== false
      }
    }),
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

function parseStrictNumber(token) {
  if (!token) return NaN;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) {
    return NaN;
  }
  const val = Number(token);
  if (isNaN(val) || !isFinite(val)) return NaN;
  return val;
}

export function compareOutput(actualRaw, expectedRaw, options = {}) {
  const compareMode = options.compareMode || 'token';
  const numberTolerance = options.numberTolerance ?? 1e-6;

  const actual = String(actualRaw ?? '').replace(/\r\n/g, '\n');
  const expected = String(expectedRaw ?? '').replace(/\r\n/g, '\n');

  if (compareMode === 'exact') {
    return { ok: actual === expected, reason: actual === expected ? 'Khớp hoàn toàn' : 'Khác biệt ký tự hoặc khoảng trắng' };
  }

  if (compareMode === 'trim') {
    const aTrim = actual.trim();
    const eTrim = expected.trim();
    return { ok: aTrim === eTrim, reason: aTrim === eTrim ? 'Khớp sau khi trim' : 'Khác biệt nội dung' };
  }

  const getTokens = (str) => {
    return str.trim().split(/\s+/).filter(t => t.length > 0);
  };

  const actualTokens = getTokens(actual);
  const expectedTokens = getTokens(expected);

  if (compareMode === 'token') {
    if (actualTokens.length !== expectedTokens.length) {
      return { 
        ok: false, 
        reason: `Số lượng token không khớp (thực tế có ${actualTokens.length} tokens, mong muốn ${expectedTokens.length} tokens).`
      };
    }

    for (let i = 0; i < actualTokens.length; i++) {
      if (actualTokens[i] !== expectedTokens[i]) {
        return {
          ok: false,
          reason: `Token thứ ${i + 1} không khớp: thực tế là "${actualTokens[i]}", mong muốn "${expectedTokens[i]}".`
        };
      }
    }

    return { ok: true, reason: 'Khớp tokens' };
  }

  if (compareMode === 'number') {
    if (actualTokens.length !== expectedTokens.length) {
      return { 
        ok: false, 
        reason: `Số lượng token không khớp (thực tế có ${actualTokens.length} tokens, mong muốn ${expectedTokens.length} tokens).`
      };
    }

    for (let i = 0; i < actualTokens.length; i++) {
      const aToken = actualTokens[i];
      const eToken = expectedTokens[i];

      const aNum = parseStrictNumber(aToken);
      const eNum = parseStrictNumber(eToken);

      const isANum = !isNaN(aNum);
      const isENum = !isNaN(eNum);

      if (isANum && isENum) {
        if (Math.abs(aNum - eNum) > numberTolerance) {
          return {
            ok: false,
            reason: `Giá trị số tại token thứ ${i + 1} không nằm trong độ lệch cho phép (thực tế ${aNum}, mong muốn ${eNum}, độ lệch tối đa ${numberTolerance}).`
          };
        }
      } else {
        if (aToken !== eToken) {
          return {
            ok: false,
            reason: `Token thứ ${i + 1} không khớp: thực tế là "${aToken}", mong muốn "${eToken}".`
          };
        }
      }
    }

    return { ok: true, reason: 'Khớp số và ký tự' };
  }

  return { ok: false, reason: 'Không hỗ trợ compare mode.' };
}

export async function judgeSubmission(code, testcases, limitMs = 1500, forceLocal = false, options = {}) {
  if (config.judgeServiceUrl && !forceLocal) return runRemote(code, testcases, limitMs, options);
  const reports = [];
  let totalWeight = 0;
  let passedWeight = 0;
  let passedCount = 0;
  const includeHiddenReport = options.includeHiddenReport === true;

  for (let index = 0; index < testcases.length; index += 1) {
    const testcase = testcases[index];
    const weight = Number(testcase.weight ?? 1);
    totalWeight += weight;

    const suppressInputPrompts = options.suppressInputPrompts !== false;
    const result = await runPythonLocal(code, testcase.input, limitMs, suppressInputPrompts);
    const actual = normalizeOutput(result.output);
    const expected = normalizeOutput(testcase.output);
    
    const errorModel = parseRunnerError(result, limitMs);
    const compareResult = compareOutput(actual, expected, options);
    const ok = !errorModel && compareResult.ok;
    
    if (ok) {
      passedWeight += weight;
      passedCount += 1;
    }
    
    const reportItem = {
      index: index + 1,
      passed: ok,
    };

    const isPublic = testcase.isPublic ?? testcase.is_public ?? false;
    reportItem.isPublic = Boolean(isPublic);
    if (isPublic || includeHiddenReport) {
      reportItem.input = testcase.input;
      reportItem.expected = expected;
      reportItem.actual = actual;
    }

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
        reportItem.error = compareResult.reason || 'Sai đáp án (Wrong Answer)';
      }
    } else {
      reportItem.status = 'Accepted';
      reportItem.error = 'Khớp đáp án';
    }
    
    reports.push(reportItem);
  }
  const total = testcases.length;
  const score = totalWeight ? Math.round((passedWeight / totalWeight) * 100) : 0;
  return { passed: passedCount, total, score, reports };
}
