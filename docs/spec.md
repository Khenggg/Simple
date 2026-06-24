# Product Spec: SimpleOJ

> **Status**: Active (Judge v2 Implemented)

## Judge Comparison Rules

SimpleOJ supports four distinct comparison modes to evaluate submission correctness:

1. **`exact`**: The output from the program must match the expected output exactly, character-for-character. This includes all spaces, tabs, and newlines.
2. **`trim`**: The output is stripped of leading and trailing whitespace/newlines before comparison. Any internal spacing must match exactly.
3. **`token` (Default)**: The output and expected output are tokenized by dividing them using whitespace delimiters (`/\s+/`). This ignores all variation in line endings (`\r\n` vs `\n`), trailing space, and intermediate white spaces. The token sequences must match exactly in value and length.
4. **`number`**: The outputs are tokenized just like in `token` mode. For each pair of tokens:
   - If both are valid numeric values (floats/integers), they are compared using a floating-point tolerance:
     $$\text{Difference} = |A - B| \le \text{number\_tolerance}$$
     Where the default `number_tolerance` is $1e-6$ (unless customized per problem).
   - If either token is non-numeric, the judge falls back to string value matching for that token.

## Testcase Properties

Each testcase has the following fields:
* **`input`**: The standard input provided to the program.
* **`expected_output`**: The expected standard output.
* **`weight`** (default `1`): Scoring weight. Submission score is calculated dynamically based on testcase weight:
  $$\text{Score} = \text{round}\left( \frac{\sum \text{weight}_{\text{passed}}}{\sum \text{weight}_{\text{total}}} \times 100 \right)$$
* **`is_public`** (default `false`):
  - **`true`**: The input, expected output, and actual program output are shown to the user in their submission details report.
  - **`false`**: Output values are hidden in the submission report to prevent hardcoded solutions, showing only status details (e.g., `Wrong Answer`, `Time Limit Exceeded`).
