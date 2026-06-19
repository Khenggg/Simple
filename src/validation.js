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
  const testcases = Array.isArray(body.testcases) ? body.testcases.slice(0, 50) : [];
  return {
    slug: cleanText(body.slug ?? body.id, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, ''),
    title: cleanText(body.title, 180),
    difficulty: cleanText(body.difficulty || 'Dễ', 40),
    difficultyLevel: Number(body.difficultyLevel ?? body.difficulty_level ?? 1),
    maxScore: Number(body.maxScore ?? body.max_score ?? 100),
    passingScore: Number(body.passingScore ?? body.passing_score ?? 100),
    publishedAt: body.publishedAt ?? body.published_at ? new Date(body.publishedAt ?? body.published_at).toISOString() : new Date().toISOString(),
    source: body.source ? String(body.source).trim().slice(0, 1000) : null,
    orderIndex: Number(body.orderIndex ?? body.order_index ?? 0),
    description: String(body.description || '').trim().slice(0, 30000),
    starterCode: String(body.starterCode ?? body.template ?? '').slice(0, 20000),
    examples: examples.map((x) => ({
      input: String(x.input ?? '').slice(0, 10000),
      output: String(x.output ?? '').slice(0, 10000),
      explanation: cleanText(x.explanation, 1000)
    })),
    testcases: testcases.map((x, idx) => ({
      input: String(x.input ?? '').slice(0, 10000),
      output: String(x.output ?? x.expected_output ?? '').slice(0, 10000),
      explanation: cleanText(x.explanation, 1000),
      isPublic: Boolean(x.isPublic ?? x.is_public ?? false),
      weight: Number(x.weight ?? 1),
      orderIndex: Number(x.orderIndex ?? x.order_index ?? idx)
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
