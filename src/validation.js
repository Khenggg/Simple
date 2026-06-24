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
  const testcases = Array.isArray(body.testcases) ? body.testcases.slice(0, 200) : [];
  
  let rating = 800;
  if (body.rating !== undefined && body.rating !== '') {
    rating = Number(body.rating);
  } else if (body.difficultyLevel !== undefined || body.difficulty_level !== undefined) {
    const df = Number(body.difficultyLevel ?? body.difficulty_level);
    if (df === 1) rating = 800;
    else if (df === 2) rating = 1200;
    else if (df === 3) rating = 1600;
  } else if (body.difficulty) {
    const dfStr = String(body.difficulty).trim();
    if (dfStr === 'Dễ') rating = 800;
    else if (dfStr === 'Trung bình') rating = 1200;
    else if (dfStr === 'Khó') rating = 1600;
  }

  return {
    slug: body.slug !== undefined ? String(body.slug).trim().toLowerCase() : (body.id !== undefined ? String(body.id).trim().toLowerCase() : ''),
    title: body.title !== undefined ? String(body.title).trim() : '',
    difficulty: cleanText(body.difficulty || 'Dễ', 40),
    rating: rating,
    maxScore: body.maxScore ?? body.max_score ?? 100,
    passingScore: body.passingScore ?? body.passing_score ?? 100,
    publishedAt: body.publishedAt ?? body.published_at ? new Date(body.publishedAt ?? body.published_at).toISOString() : new Date().toISOString(),
    source: body.source ? String(body.source).trim().slice(0, 1000) : null,
    orderIndex: body.orderIndex ?? body.order_index ?? 0,
    description: body.description !== undefined ? String(body.description).trim() : '',
    starterCode: String(body.starterCode ?? body.template ?? '').slice(0, 20000),
    examples: examples.map((x) => ({
      input: x.input !== undefined ? String(x.input).slice(0, 10000) : '',
      output: x.output !== undefined ? String(x.output).slice(0, 10000) : '',
      explanation: x.explanation !== undefined ? cleanText(x.explanation, 1000) : ''
    })),
    testcases: testcases.map((x, idx) => ({
      input: x.input !== undefined ? String(x.input).slice(0, 10000) : '',
      output: (x.output !== undefined || x.expected_output !== undefined)
        ? String(x.output ?? x.expected_output ?? '').slice(0, 10000)
        : undefined,
      explanation: x.explanation !== undefined ? cleanText(x.explanation, 1000) : '',
      isPublic: Boolean(x.isPublic ?? x.is_public ?? false),
      weight: x.weight !== undefined ? Number(x.weight) : 1,
      orderIndex: x.orderIndex ?? x.order_index ?? idx
    })),
    timeLimitMinutes: body.timeLimitMinutes ?? body.time_limit_minutes ?? 30,
    executionLimitMs: body.executionLimitMs ?? body.execution_limit_ms ?? 1500,
    isActive: body.isActive ?? body.is_active ?? true,
    compareMode: cleanText(body.compareMode ?? (body.compare_mode || 'token'), 20),
    numberTolerance: body.numberTolerance ?? body.number_tolerance ?? 1e-6
  };
}

export function validateProblem(problem) {
  const errors = [];
  
  // Validate slug
  if (!problem.slug) {
    errors.push('Slug không được để trống.');
  } else {
    if (problem.slug.length < 2 || problem.slug.length > 100) {
      errors.push('Slug phải từ 2 đến 100 ký tự.');
    }
    if (/[^a-z0-9_-]/.test(problem.slug)) {
      errors.push('Slug chỉ được chứa ký tự thường (a-z), số (0-9), dấu gạch ngang (-) và gạch dưới (_).');
    }
  }

  // Validate title
  if (!problem.title) {
    errors.push('Thiếu tên bài.');
  } else if (problem.title.length > 200) {
    errors.push('Tên bài không được vượt quá 200 ký tự.');
  }

  // Validate description
  if (!problem.description) {
    errors.push('Thiếu đề bài.');
  }

  // Validate rating
  const rating = Number(problem.rating);
  if (problem.rating === undefined || isNaN(rating) || !Number.isInteger(rating) || rating < 800 || rating > 3500 || rating % 100 !== 0) {
    errors.push('Rating không hợp lệ (phải từ 800 đến 3500 và chia hết cho 100).');
  }

  // Validate passing score
  const passingScore = Number(problem.passingScore);
  if (problem.passingScore === undefined || isNaN(passingScore) || !Number.isInteger(passingScore) || passingScore < 0 || passingScore > 100) {
    errors.push('Passing score phải là số nguyên từ 0 đến 100.');
  }

  // Validate max score
  const maxScore = Number(problem.maxScore);
  if (problem.maxScore === undefined || isNaN(maxScore) || !Number.isInteger(maxScore) || maxScore < 1 || maxScore > 100) {
    errors.push('Max score phải là số nguyên từ 1 đến 100.');
  }

  // Validate time limit minutes
  const timeLimitMinutes = Number(problem.timeLimitMinutes);
  if (problem.timeLimitMinutes === undefined || isNaN(timeLimitMinutes) || !Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 1 || timeLimitMinutes > 240) {
    errors.push('Thời gian giới hạn (phút) phải là số nguyên từ 1 đến 240.');
  }

  // Validate execution limit ms
  const executionLimitMs = Number(problem.executionLimitMs);
  if (problem.executionLimitMs === undefined || isNaN(executionLimitMs) || !Number.isInteger(executionLimitMs) || executionLimitMs < 250 || executionLimitMs > 5000) {
    errors.push('Giới hạn thực thi (ms) phải là số nguyên từ 250 đến 5000.');
  }

  // Validate compare mode
  if (!problem.compareMode || !['exact', 'trim', 'token', 'number'].includes(problem.compareMode)) {
    errors.push('Compare mode không hợp lệ.');
  }

  // Validate number tolerance
  const numberTolerance = Number(problem.numberTolerance);
  if (problem.compareMode === 'number') {
    if (problem.numberTolerance === undefined || isNaN(numberTolerance) || numberTolerance < 0 || numberTolerance > 1) {
      errors.push('Number tolerance phải lớn hơn hoặc bằng 0 và nhỏ hơn hoặc bằng 1.');
    }
  }

  // Validate examples
  if (!Array.isArray(problem.examples)) {
    errors.push('Examples phải là một danh sách (array).');
  } else {
    for (let i = 0; i < problem.examples.length; i++) {
      const ex = problem.examples[i];
      if (typeof ex.input !== 'string' || typeof ex.output !== 'string') {
        errors.push(`Ví dụ thứ ${i + 1} phải chứa input và output dưới dạng chuỗi (string).`);
      }
    }
  }

  // Validate testcases
  if (!Array.isArray(problem.testcases) || !problem.testcases.length) {
    errors.push('Cần ít nhất một test case.');
  } else if (problem.testcases.length > 200) {
    errors.push('Số lượng testcase không được vượt quá 200.');
  } else {
    for (let i = 0; i < problem.testcases.length; i++) {
      const tc = problem.testcases[i];
      if (typeof tc.input !== 'string') {
        errors.push(`Testcase thứ ${i + 1} có input không hợp lệ (phải là chuỗi).`);
      }
      if (tc.output === undefined) {
        errors.push(`Testcase thứ ${i + 1} thiếu expected output.`);
      } else if (typeof tc.output !== 'string') {
        errors.push(`Testcase thứ ${i + 1} có output không hợp lệ (phải là chuỗi).`);
      }
      const weight = Number(tc.weight);
      if (tc.weight === undefined || isNaN(weight) || !Number.isInteger(weight) || weight < 1 || weight > 100) {
        errors.push(`Testcase thứ ${i + 1} có trọng số (weight) không hợp lệ (phải là số nguyên từ 1 đến 100).`);
      }
      if (typeof tc.isPublic !== 'boolean') {
        errors.push(`Testcase thứ ${i + 1} có trường isPublic không hợp lệ (phải là boolean).`);
      }
    }
  }

  return errors;
}

