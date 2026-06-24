import { canonicalProblems } from '../data/canonical-problems.js';
import { compareOutput } from '../src/judge.js';

const referenceSolutions = {
  'sum': (input) => {
    const [a, b] = input.trim().split(/\s+/).map(Number);
    return String(a + b);
  },
  'cf-4a-watermelon': (input) => {
    const w = Number(input.trim());
    return w > 2 && w % 2 === 0 ? 'YES' : 'NO';
  },
  'case_count': (input) => {
    const s = input.trim();
    let up = 0;
    let low = 0;
    for (const c of s) {
      if (/[A-Z]/.test(c)) up++;
      else if (/[a-z]/.test(c)) low++;
    }
    return `${up} ${low}`;
  },
  'cf-9a-die-roll': (input) => {
    const [Y, W] = input.trim().split(/\s+/).map(Number);
    const maxVal = Math.max(Y, W);
    const numerator = 6 - maxVal + 1;
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const g = gcd(numerator, 6);
    return `${numerator / g}/${6 / g}`;
  },
  'cf-32b-borze': (input) => {
    const s = input.trim();
    let res = '';
    let i = 0;
    while (i < s.length) {
      if (s[i] === '.') {
        res += '0';
        i++;
      } else if (s.slice(i, i + 2) === '-.') {
        res += '1';
        i += 2;
      } else if (s.slice(i, i + 2) === '--') {
        res += '2';
        i += 2;
      } else {
        i++;
      }
    }
    return res;
  },
  'cf-38a-army': (input) => {
    const lines = input.trim().split('\n');
    const n = Number(lines[0]);
    const d = lines[1].trim().split(/\s+/).map(Number);
    const [a, b] = lines[2].trim().split(/\s+/).map(Number);
    let sum = 0;
    for (let i = a - 1; i < b - 1; i++) {
      sum += d[i];
    }
    return String(sum);
  },
  'cf-41a-translation': (input) => {
    const lines = input.trim().split('\n');
    const s = lines[0].trim();
    const t = lines[1].trim();
    const reversed = s.split('').reverse().join('');
    return t === reversed ? 'YES' : 'NO';
  },
  'cf-59a-word': (input) => {
    const s = input.trim();
    let up = 0;
    let low = 0;
    for (const c of s) {
      if (c >= 'A' && c <= 'Z') up++;
      else if (c >= 'a' && c <= 'z') low++;
    }
    return up > low ? s.toUpperCase() : s.toLowerCase();
  },
  'cf-6a-triangle': (input) => {
    const sides = input.trim().split(/\s+/).map(Number);
    sides.sort((a, b) => a - b);
    let hasTriangle = false;
    let hasSegment = false;
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        for (let k = j + 1; k < 4; k++) {
          const x = sides[i];
          const y = sides[j];
          const z = sides[k];
          if (x + y > z) hasTriangle = true;
          else if (x + y === z) hasSegment = true;
        }
      }
    }
    if (hasTriangle) return 'TRIANGLE';
    if (hasSegment) return 'SEGMENT';
    return 'IMPOSSIBLE';
  },
  'cf-26a-almost-prime': (input) => {
    const n = Number(input.trim());
    const isPrime = (num) => {
      if (num < 2) return false;
      for (let i = 2; i * i <= num; i++) {
        if (num % i === 0) return false;
      }
      return true;
    };
    let count = 0;
    for (let i = 1; i <= n; i++) {
      let primes = 0;
      for (let j = 2; j <= i; j++) {
        if (i % j === 0 && isPrime(j)) {
          primes++;
        }
      }
      if (primes === 2) count++;
    }
    return String(count);
  },
  'cf-96a-football': (input) => {
    const s = input.trim();
    return s.includes('0000000') || s.includes('1111111') ? 'YES' : 'NO';
  },
  'cf-11a-increasing-sequence': (input) => {
    const lines = input.trim().split('\n');
    const [n, d] = lines[0].trim().split(/\s+/).map(Number);
    const b = lines[1].trim().split(/\s+/).map(Number);
    let steps = 0;
    for (let i = 1; i < n; i++) {
      if (b[i] <= b[i-1]) {
        const diff = b[i-1] - b[i] + 1;
        const s = Math.ceil(diff / d);
        b[i] += s * d;
        steps += s;
      }
    }
    return String(steps);
  }
};

const knownWrongSolutions = {
  'cf-4a-watermelon': [
    // Wrong solution 1: always output YES
    { name: 'Always YES', solve: () => 'YES' },
    // Wrong solution 2: YES for 2
    { name: 'YES for 2', solve: (input) => {
      const w = Number(input.trim());
      return w % 2 === 0 ? 'YES' : 'NO';
    }}
  ]
};

async function verifyAll() {
  console.log('--- BAT DAU VERIFY TESTCASES VOI REFERENCE SOLUTIONS ---');
  let totalErrors = 0;

  for (const problem of canonicalProblems) {
    const slug = problem.slug;
    const refSolve = referenceSolutions[slug];
    if (!refSolve) {
      console.error(`Lỗi: Thiếu reference solution cho bài: ${slug}`);
      totalErrors++;
      continue;
    }

    console.log(`Verifying: ${slug} (${problem.testcases.length} testcases)`);
    let problemErrors = 0;

    for (let idx = 0; idx < problem.testcases.length; idx++) {
      const tc = problem.testcases[idx];
      const actual = refSolve(tc.input);
      const expected = tc.output;

      const comp = compareOutput(actual, expected, {
        compareMode: problem.compareMode,
        numberTolerance: problem.numberTolerance
      });

      if (!comp.ok) {
        console.error(`  ❌ Mismatch ở testcase #${idx + 1}:`);
        console.error(`     Input: ${JSON.stringify(tc.input)}`);
        console.error(`     Expected: ${JSON.stringify(expected)}`);
        console.error(`     Actual: ${JSON.stringify(actual)}`);
        console.error(`     Reason: ${comp.reason}`);
        problemErrors++;
        totalErrors++;
      }
    }

    if (problemErrors === 0) {
      console.log(`  ✅ Tat ca testcases deu dung!`);
    }

    // Verify known wrong solutions fail at least one testcase
    const wrongSolves = knownWrongSolutions[slug];
    if (wrongSolves) {
      for (const ws of wrongSolves) {
        let failedAtLeastOne = false;
        for (let idx = 0; idx < problem.testcases.length; idx++) {
          const tc = problem.testcases[idx];
          const actual = ws.solve(tc.input);
          const expected = tc.output;
          const comp = compareOutput(actual, expected, {
            compareMode: problem.compareMode,
            numberTolerance: problem.numberTolerance
          });
          if (!comp.ok) {
            failedAtLeastOne = true;
            break;
          }
        }
        if (failedAtLeastOne) {
          console.log(`  ✅ Wrong solution "${ws.name}" da bi bat thanh cong!`);
        } else {
          console.error(`  ❌ LỖI: Wrong solution "${ws.name}" vượt qua toàn bộ testcases!`);
          totalErrors++;
        }
      }
    }
  }

  console.log('------------------------------------------------');
  if (totalErrors === 0) {
    console.log('🎉 THANH CONG: Tat ca reference solutions deu khop!');
    process.exit(0);
  } else {
    console.error(`❌ THAT BAI: Tim thay ${totalErrors} loi.`);
    process.exit(1);
  }
}

verifyAll();
