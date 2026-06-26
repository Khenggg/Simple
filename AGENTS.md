# Agent Instructions for SimpleOJ

## Language Policy

- Repository-level agent instructions must be written in English.
- Never respond to Ken in Chinese.
- Reply to Ken in Vietnamese by default.
- If Ken explicitly asks for English, reply in English.
- If any source file contains Chinese text, translate or summarize it in Vietnamese or English; do not continue responding in Chinese.

## Project Context

SimpleOJ is a small Python Online Judge for students.

The project uses:
- Node.js / Express backend
- PostgreSQL database
- Static frontend in `public/`
- Python runner for judging submissions
- Cookie-based session auth
- Admin features for problems, users, groups, assignments, and submission review

## Coding Rules

- Do not expose secrets.
- Do not run destructive database scripts unless explicitly confirmed.
- Do not run integration tests against production or Supabase databases.
- Use local PostgreSQL for tests.
- Keep student-facing labels, exercise statements, and classroom UI in Vietnamese.
- Technical comments may be English or Vietnamese, but prefer English for reusable agent instructions.
- Do not change business logic unless the task explicitly asks for it.

## Database Safety

Never run these commands against production unless the user explicitly confirms:

```bash
npm test
node --test
node scripts/reset-and-seed-basic-problems.js --apply
npm run problems:reset-basic -- --apply
node scripts/cleanup-duplicate-problems.js --apply
node scripts/replace-testcases.js --apply
```

## Response Style

- Be direct.
- Explain what changed.
- Mention files modified.
- Mention tests run.
- If a change is risky, warn before applying it.
