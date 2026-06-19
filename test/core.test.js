import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { normalizeProblem, validateProblem } from '../src/validation.js';
import { runPythonLocal, judgeSubmission } from '../src/judge.js';

test('password hashing verifies correct password only', () => {
  const stored = hashPassword('Secret123');
  assert.equal(verifyPassword('Secret123', stored), true);
  assert.equal(verifyPassword('Wrong123', stored), false);
  assert.notEqual(stored, 'Secret123');
});

test('problem normalization supports legacy problem shape', () => {
  const problem = normalizeProblem({ id: 'hello', title: 'Hello', description: 'Say hi', template: 'print("hi")', testcases: [{ input:'', output:'hi' }] });
  assert.equal(problem.starterCode, 'print("hi")');
  assert.deepEqual(validateProblem(problem), []);
});

test('python runner captures output and runtime errors', async () => {
  const ok = await runPythonLocal('print(int(input()) * 2)', '4', 1200);
  assert.equal(ok.output.trim(), '8');
  assert.equal(ok.error, null);
  const bad = await runPythonLocal('raise ValueError("boom")', '', 1200);
  assert.match(bad.error, /ValueError: boom/);
});

test('judge scores exact normalized outputs', async () => {
  const result = await judgeSubmission('a,b=map(int,input().split());print(a+b)', [
    { input:'2 3', output:'5' }, { input:'-1 1', output:'0' }
  ], 1200, true);
  assert.equal(result.score, 100);
  assert.equal(result.passed, 2);
});

test('python runner stops infinite loops', async () => {
  const started = Date.now();
  const result = await runPythonLocal('while True: pass', '', 350);
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 2000);
});
