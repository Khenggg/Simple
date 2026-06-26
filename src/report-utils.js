export function normalizeSubmissionReport(report) {
  if (Array.isArray(report)) return report;

  if (typeof report === 'string') {
    try {
      const parsed = JSON.parse(report);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function maskSubmissionReportForStudent(report) {
  if (!Array.isArray(report)) return [];

  return report.map((item) => {
    const isPublic = item?.isPublic === true || item?.public === true;
    if (isPublic) return item;

    const masked = { ...item };
    delete masked.input;
    delete masked.expected;
    delete masked.actual;
    delete masked.stdin;
    delete masked.expectedOutput;
    delete masked.actualOutput;
    delete masked.stdout;
    delete masked.stderr;
    return masked;
  });
}
