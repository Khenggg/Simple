import test from 'node:test';
import assert from 'node:assert/strict';
import { compareOutput, judgeSubmission } from '../src/judge.js';

test('compareOutput - exact mode', () => {
  // Exact mode matches character-for-character, preserving newlines and spaces
  assert.deepEqual(compareOutput('Hello\n', 'Hello\n', { compareMode: 'exact' }), { ok: true, reason: 'Khớp hoàn toàn' });
  
  // Trailing newline difference
  const newlineDiff = compareOutput('Hello', 'Hello\n', { compareMode: 'exact' });
  assert.equal(newlineDiff.ok, false);
  
  // Spaces difference
  assert.equal(compareOutput('Hello  world', 'Hello world', { compareMode: 'exact' }).ok, false);
});

test('compareOutput - trim mode', () => {
  // Trim mode ignores leading/trailing whitespaces and newlines
  assert.deepEqual(compareOutput('  Hello\n', 'Hello', { compareMode: 'trim' }), { ok: true, reason: 'Khớp sau khi trim' });
  assert.equal(compareOutput('Hello\nworld', 'Hello  world', { compareMode: 'trim' }).ok, false);
});

test('compareOutput - token mode', () => {
  // Token mode splits by whitespace, ignoring spacing layout differences
  assert.deepEqual(compareOutput('1\n2 3', '1 2 3', { compareMode: 'token' }), { ok: true, reason: 'Khớp tokens' });
  
  const lenMismatch = compareOutput('1 2 3', '1 2', { compareMode: 'token' });
  assert.equal(lenMismatch.ok, false);
  assert.match(lenMismatch.reason, /Số lượng token không khớp/);

  const valMismatch = compareOutput('hello world', 'hello user', { compareMode: 'token' });
  assert.equal(valMismatch.ok, false);
  assert.match(valMismatch.reason, /Token thứ 2 không khớp/);
});

test('compareOutput - number mode', () => {
  // Float tolerance comparison
  assert.deepEqual(compareOutput('3.141592', '3.141593', { compareMode: 'number', numberTolerance: 1e-5 }), { ok: true, reason: 'Khớp số và ký tự' });
  
  const outOfTolerance = compareOutput('3.141592', '3.15', { compareMode: 'number', numberTolerance: 1e-5 });
  assert.equal(outOfTolerance.ok, false);
  assert.match(outOfTolerance.reason, /độ lệch tối đa/);

  // Strict numeric parser checks
  // Accept standard formats: 1, -1, 3.14, -0.5, .5, 1e-6, -2.5E+8
  assert.equal(compareOutput('1', '1.0', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('-1', '-1.0', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('3.14', '3.1400', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('-0.5', '-0.5', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('.5', '0.5', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('1e-6', '0.000001', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('-2.5E+8', '-250000000', { compareMode: 'number' }).ok, true);

  // Reject partials/infinities/NaN: 3abc, 1.2.3, abc, Infinity, NaN
  // They fall back to string comparison, so "3abc" !== "3"
  const partialMismatch = compareOutput('3abc', '3', { compareMode: 'number' });
  assert.equal(partialMismatch.ok, false);

  const infMismatch = compareOutput('Infinity', 'Infinity', { compareMode: 'number' });
  // Fallback to exact string match for non-numeric tokens
  assert.equal(infMismatch.ok, true); // identical string matches
  assert.equal(compareOutput('Infinity', '1000', { compareMode: 'number' }).ok, false);

  // Mixed tokens fallback to string check
  assert.equal(compareOutput('hello 3.14', 'hello 3.14', { compareMode: 'number' }).ok, true);
  assert.equal(compareOutput('hello 3.14', 'world 3.14', { compareMode: 'number' }).ok, false);
});

test('judgeSubmission - weighted score & private testcases masking', async () => {
  const code = 'import sys\nx = int(sys.stdin.read().strip())\nif x == 1:\n    print(1)\nelse:\n    print(5)\n';
  
  const testcases = [
    { input: '1', output: '1\n', weight: 1, isPublic: true },
    { input: '2', output: '4\n', weight: 3, isPublic: false }
  ];

  const result = await judgeSubmission(code, testcases, 1500, true, { compareMode: 'token' });
  
  assert.equal(result.score, 25);
  assert.equal(result.passed, 1);
  assert.equal(result.total, 2);
  
  // Public testcase: retains inputs/outputs
  const reportPublic = result.reports[0];
  assert.equal(reportPublic.passed, true);
  assert.equal(reportPublic.input, '1');
  assert.equal(reportPublic.expected, '1\n'); // normalized newline but no trim
  assert.equal(reportPublic.actual, '1\n');

  // Private testcase: masks inputs/outputs
  const reportPrivate = result.reports[1];
  assert.equal(reportPrivate.passed, false);
  assert.equal(reportPrivate.input, undefined);
  assert.equal(reportPrivate.expected, undefined);
  assert.equal(reportPrivate.actual, undefined);
});
