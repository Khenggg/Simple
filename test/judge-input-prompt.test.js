import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeSubmission } from '../src/judge.js';

test('1. one input prompt should be ignored', async () => {
  const code = `
n = int(input("Nhap n: "))
print(n * 2)
`;

  const result = await judgeSubmission(
    code,
    [{ input: "5\n", output: "10\n", isPublic: true }],
    1500,
    true,
    { compareMode: "token" }
  );

  assert.equal(result.score, 100);
  assert.equal(result.reports[0].actual, "10\n");
});

test('2. multiple input prompts should be ignored', async () => {
  const code = `
a = int(input("Nhap a: "))
b = int(input("Nhap b: "))
print(a + b)
`;

  const result = await judgeSubmission(
    code,
    [{ input: "3\n5\n", output: "8\n", isPublic: true }],
    1500,
    true,
    { compareMode: "token" }
  );

  assert.equal(result.score, 100);
});

test('3. Vietnamese prompt should be ignored', async () => {
  const code = `
n = int(input("Nhập số n: "))
print(n)
`;

  const result = await judgeSubmission(
    code,
    [{ input: "7\n", output: "7\n", isPublic: true }],
    1500,
    true,
    { compareMode: "token" }
  );

  assert.equal(result.score, 100);
});

test('4. explicit print should not be ignored', async () => {
  const code = `
print("Nhap n:")
n = int(input())
print(n)
`;

  const result = await judgeSubmission(
    code,
    [{ input: "5\n", output: "5\n", isPublic: true }],
    1500,
    true,
    { compareMode: "token" }
  );

  assert.equal(result.score, 0);
  assert.match(result.reports[0].actual, /Nhap n:/);
});

test('5. EOF behavior stays correct', async () => {
  const code = `
a = input("a: ")
b = input("b: ")
print(a, b)
`;

  const result = await judgeSubmission(
    code,
    [{ input: "hello\n", output: "hello world\n", isPublic: true }],
    1500,
    true,
    { compareMode: "token" }
  );

  assert.equal(result.score, 0);
  assert.match(result.reports[0].error || "", /EOF|đọc quá nhiều dữ liệu|input/);
});
