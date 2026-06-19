export function cleanText(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

export function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeProblem(body) {
  const examples = Array.isArray(body.examples) ? body.examples.slice(0, 10) : [];
  const testcases = Array.isArray(body.testcases) ? body.testcases.slice(0, 30) : [];
  return {
    slug: cleanText(body.slug ?? body.id, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, ''),
    title: cleanText(body.title, 180),
    difficulty: cleanText(body.difficulty || 'Dễ', 40),
    description: String(body.description || '').trim().slice(0, 30000),
    starterCode: String(body.starterCode ?? body.template ?? '').slice(0, 20000),
    examples: examples.map((x) => ({
      input: String(x.input ?? '').slice(0, 10000),
      output: String(x.output ?? '').slice(0, 10000),
      explanation: cleanText(x.explanation, 1000)
    })),
    testcases: testcases.map((x) => ({
      input: String(x.input ?? '').slice(0, 10000),
      output: String(x.output ?? '').slice(0, 10000)
    })),
    timeLimitMinutes: Math.min(240, Math.max(1, Number(body.timeLimitMinutes ?? body.time_limit_minutes ?? 30))),
    executionLimitMs: Math.min(5000, Math.max(250, Number(body.executionLimitMs ?? body.execution_limit_ms ?? 1500))),
    isActive: body.isActive ?? body.is_active ?? true
  };
}

export function validateProblem(problem) {
  const errors = [];
  if (!problem.slug) errors.push('Slug không hợp lệ.');
  if (!problem.title) errors.push('Thiếu tên bài.');
  if (!problem.description) errors.push('Thiếu đề bài.');
  if (!problem.testcases.length) errors.push('Cần ít nhất một test case.');
  return errors;
}
