import test from 'node:test';
import assert from 'node:assert/strict';
import { runPythonLocal, parseRunnerError, judgeSubmission } from '../src/judge.js';

test('python runner blocks prohibited imports', async () => {
  const result = await runPythonLocal('import os', '', 1200);
  assert.ok(result.error);
  assert.match(result.error, /Blocked import: os/);
  assert.match(result.error, /ImportError/);
});

test('python runner cleans traceback by removing runner internal frames', async () => {
  const result = await runPythonLocal('def f():\n    raise ValueError("custom error")\nf()', '', 1200);
  assert.ok(result.error);
  assert.match(result.error, /ValueError: custom error/);
  assert.match(result.error, /submission\.py/);
  assert.ok(!result.error.includes('python-runner.py'));
});

test('parseRunnerError maps errors correctly', () => {
  // Time Limit Exceeded
  const tle = parseRunnerError({ timedOut: true }, 1500);
  assert.equal(tle.type, 'TIME_LIMIT_EXCEEDED');
  assert.equal(tle.status, 'Time Limit Exceeded');
  assert.equal(tle.safeForUser, true);

  // Output Limit Exceeded
  const ole = parseRunnerError({ truncated: true }, 1500);
  assert.equal(ole.type, 'OUTPUT_LIMIT_EXCEEDED');
  assert.equal(ole.status, 'Output Limit Exceeded');

  // Memory Limit Exceeded
  const mle = parseRunnerError({ error: 'MemoryError: out of memory' }, 1500);
  assert.equal(mle.type, 'MEMORY_LIMIT_EXCEEDED');
  assert.equal(mle.status, 'Memory Limit Exceeded');

  // Input Limit Exceeded / EOFError
  const eof = parseRunnerError({ error: 'EOFError: EOF when reading a line' }, 1500);
  assert.equal(eof.type, 'USER_CODE_INPUT_ERROR');
  assert.equal(eof.status, 'Runtime Error');

  // Blocked Import
  const blocked = parseRunnerError({ error: '[Blocked import: os]\nImportError: import of os is blocked' }, 1500);
  assert.equal(blocked.type, 'BLOCKED_IMPORT_OR_OPERATION');
  assert.equal(blocked.status, 'Runtime Error');
  assert.match(blocked.message, /Blocked import: os/);

  // Syntax Error
  const syntax = parseRunnerError({ error: '  File "submission.py", line 2\n    if True\n          ^\nSyntaxError: expected \':\'' }, 1500);
  assert.equal(syntax.type, 'USER_CODE_SYNTAX_ERROR');
  assert.equal(syntax.status, 'Runtime Error');
  assert.equal(syntax.line, 2);

  // Runtime Error
  const runtime = parseRunnerError({ error: '  File "submission.py", line 3, in <module>\n    1/0\nZeroDivisionError: division by zero' }, 1500);
  assert.equal(runtime.type, 'USER_CODE_RUNTIME_ERROR');
  assert.equal(runtime.status, 'Runtime Error');
  assert.equal(runtime.line, 3);
  assert.match(runtime.message, /division by zero/);

  // Runner System Error
  const sysErr = parseRunnerError({ error: 'Runner error: không thể khởi động môi trường chạy Python' }, 1500);
  assert.equal(sysErr.type, 'RUNNER_SYSTEM_ERROR');
  assert.equal(sysErr.status, 'Runtime Error');
  assert.equal(sysErr.safeForUser, false);
});

test('judgeSubmission hides actual and expected inputs/outputs from reports', async () => {
  const testcases = [
    { input: '1 2', output: '3' },
    { input: '4 5', output: '9' }
  ];
  // Wrong answer submission
  const result = await judgeSubmission('print(0)', testcases, 1200, true);
  assert.equal(result.passed, 0);
  assert.equal(result.reports.length, 2);
  for (const report of result.reports) {
    assert.equal(report.passed, false);
    assert.equal(report.status, 'Wrong Answer');
    // Verify no actual/expected or inputs are leaked in the reports
    assert.equal(report.input, undefined);
    assert.equal(report.actual, undefined);
    assert.equal(report.expected, undefined);
  }
});
