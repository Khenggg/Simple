import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import { pool, transaction } from '../src/db.js';

// Get timestamp in format YYYYMMDD-HHmmss
function getTimestamp() {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}-${HH}${mm}${ss}`;
}

async function checkIfTableExists(client, tableName) {
  const res = await client.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables 
       WHERE table_schema = 'public' 
       AND table_name = $1
     )`,
    [tableName]
  );
  return res.rows[0].exists;
}

// 5 exercises definition
const groupDefinition = {
  slug: "bai-tap-co-ban",
  name: "Bài tập cơ bản",
  description: "Nhóm bài tập cơ bản giúp học sinh luyện điều kiện, so sánh, chia lấy dư và công thức toán học.",
  groupType: "BASIC",
  orderIndex: 1,
  isActive: true
};

const problemsDefinition = [
  {
    slug: "bai-20-giai-phuong-trinh-bac-hai",
    title: "Bài 20: Giải phương trình bậc hai",
    difficulty: "Dễ - Trung bình",
    rating: 900,
    source: "SimpleOJ - Bài tập cơ bản",
    orderIndex: 20,
    timeLimitMinutes: 30,
    executionLimitMs: 1500,
    maxScore: 100,
    passingScore: 100,
    compareMode: "number",
    numberTolerance: 1e-6,
    isActive: true,
    starterCode: "# Viet chuong trinh cua em o day\n",
    examples: [
      {
        input: "3\n5\n2\n",
        output: "2\n-0.6666666667 -1\n",
        explanation: "Phương trình 3x^2 + 5x + 2 = 0 có hai nghiệm phân biệt x1 = -2/3, x2 = -1."
      },
      {
        input: "1\n-2\n1\n",
        output: "1\n1\n",
        explanation: "Phương trình x^2 - 2x + 1 = 0 có nghiệm kép x = 1."
      },
      {
        input: "1\n0\n1\n",
        output: "0\n",
        explanation: "Phương trình x^2 + 1 = 0 vô nghiệm."
      }
    ],
    description: `# Bài 20: Giải phương trình bậc hai

Viết chương trình giải phương trình bậc hai:

$$ax^2 + bx + c = 0$$

Trong bài này, luôn có \`a != 0\`.

## Dữ liệu vào

Gồm 3 dòng:

- Dòng 1 chứa số thực \`a\`
- Dòng 2 chứa số thực \`b\`
- Dòng 3 chứa số thực \`c\`

## Dữ liệu ra

Nếu phương trình có 2 nghiệm phân biệt, in:

- Dòng 1: số \`2\`
- Dòng 2: hai nghiệm \`x1 x2\`

Nếu phương trình có nghiệm kép, in:

- Dòng 1: số \`1\`
- Dòng 2: nghiệm duy nhất

Nếu phương trình vô nghiệm trong tập số thực, in:

- Một dòng duy nhất chứa số \`0\`

Với trường hợp có 2 nghiệm phân biệt:

- \`x1\` là nghiệm ứng với dấu \`+\`
- \`x2\` là nghiệm ứng với dấu \`-\`

Kết quả số thực được chấp nhận nếu sai số không quá \`1e-6\`.

## Lưu ý

Khi nộp bài trên hệ thống, chỉ in đúng kết quả yêu cầu.
Không in các dòng như “Nhập n:”, “nhập a:”, “nhập b:”, “nhập c:”.
Không in các dòng chữ như \`Phương trình có 2 nghiệm phân biệt:\`.
Chỉ in đúng kết quả theo định dạng yêu cầu.`,
    testcases: [
      { input: "3\n5\n2\n", output: "2\n-0.6666666667 -1\n", isPublic: true, weight: 1 },
      { input: "1\n-2\n1\n", output: "1\n1\n", isPublic: true, weight: 1 },
      { input: "1\n0\n1\n", output: "0\n", isPublic: true, weight: 1 },
      { input: "1\n-3\n2\n", output: "2\n2 1\n", isPublic: false, weight: 2 },
      { input: "1\n0\n-4\n", output: "2\n2 -2\n", isPublic: false, weight: 2 },
      { input: "-1\n0\n4\n", output: "2\n-2 2\n", isPublic: false, weight: 2 },
      { input: "1\n2\n5\n", output: "0\n", isPublic: false, weight: 2 },
      { input: "2\n-7\n3\n", output: "2\n3 0.5\n", isPublic: false, weight: 3 },
      { input: "5\n6\n1\n", output: "2\n-0.2 -1\n", isPublic: false, weight: 3 },
      { input: "1\n1\n0\n", output: "2\n0 -1\n", isPublic: false, weight: 2 },
      { input: "1\n-1\n-1\n", output: "2\n1.61803398875 -0.61803398875\n", isPublic: false, weight: 4 },
      { input: "4\n4\n1\n", output: "1\n-0.5\n", isPublic: false, weight: 3 }
    ]
  },
  {
    slug: "bai-21-kiem-tra-chan-le",
    title: "Bài 21: Kiểm tra số chẵn/lẻ",
    difficulty: "Dễ",
    rating: 800,
    source: "SimpleOJ - Bài tập cơ bản",
    orderIndex: 21,
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    maxScore: 100,
    passingScore: 100,
    compareMode: "token",
    numberTolerance: 1e-6,
    isActive: true,
    starterCode: "# Viet chuong trinh cua em o day\n",
    examples: [
      {
        input: "12\n",
        output: "12 la so chan\n",
        explanation: "12 chia hết cho 2 nên là số chẵn."
      },
      {
        input: "7\n",
        output: "7 la so le\n",
        explanation: "7 không chia hết cho 2 nên là số lẻ."
      }
    ],
    description: `# Bài 21: Kiểm tra số chẵn/lẻ

Viết chương trình nhập vào một số nguyên dương \`n\`.

Hãy cho biết \`n\` là số chẵn hay số lẻ.

## Dữ liệu vào

Một dòng duy nhất chứa số nguyên dương \`n\`.

## Dữ liệu ra

Nếu \`n\` là số chẵn, in:

\`\`\`text
n la so chan
\`\`\`

Nếu \`n\` là số lẻ, in:

\`\`\`text
n la so le
\`\`\`

Trong đó \`n\` là giá trị đã nhập.

## Ví dụ

Input:

\`\`\`text
12
\`\`\`

Output:

\`\`\`text
12 la so chan
\`\`\`

## Lưu ý

Khi nộp bài trên hệ thống, chỉ in đúng kết quả yêu cầu.
Không in các dòng như “Nhập n:”, “nhập a:”, “nhập b:”, “nhập c:”.
Không in dòng \`Nhap n:\`.
Chỉ in đúng kết quả.`,
    testcases: [
      { input: "12\n", output: "12 la so chan\n", isPublic: true, weight: 1 },
      { input: "7\n", output: "7 la so le\n", isPublic: true, weight: 1 },
      { input: "1\n", output: "1 la so le\n", isPublic: false, weight: 2 },
      { input: "2\n", output: "2 la so chan\n", isPublic: false, weight: 2 },
      { input: "99\n", output: "99 la so le\n", isPublic: false, weight: 2 },
      { input: "100\n", output: "100 la so chan\n", isPublic: false, weight: 2 },
      { input: "123456789\n", output: "123456789 la so le\n", isPublic: false, weight: 3 },
      { input: "1000000000\n", output: "1000000000 la so chan\n", isPublic: false, weight: 3 }
    ]
  },
  {
    slug: "bai-22-cung-tinh-chan-le",
    title: "Bài 22: Kiểm tra hai số cùng tính chẵn lẻ",
    difficulty: "Dễ",
    rating: 800,
    source: "SimpleOJ - Bài tập cơ bản",
    orderIndex: 22,
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    maxScore: 100,
    passingScore: 100,
    compareMode: "token",
    numberTolerance: 1e-6,
    isActive: true,
    starterCode: "# Viet chuong trinh cua em o day\n",
    examples: [
      {
        input: "10\n20\n",
        output: "DUNG\n",
        explanation: "10 và 20 cùng là số chẵn."
      },
      {
        input: "3\n5\n",
        output: "DUNG\n",
        explanation: "3 và 5 cùng là số lẻ."
      },
      {
        input: "2\n3\n",
        output: "SAI\n",
        explanation: "2 là số chẵn còn 3 là số lẻ."
      }
    ],
    description: `# Bài 22: Kiểm tra hai số cùng tính chẵn lẻ

Viết chương trình nhập vào hai số tự nhiên \`M\` và \`N\`.

Hãy thông báo:

- \`DUNG\` nếu \`M\` và \`N\` cùng tính chẵn lẻ.
- \`SAI\` nếu \`M\` và \`N\` khác tính chẵn lẻ.

Hai số cùng tính chẵn lẻ nghĩa là:

- cả hai đều chẵn, hoặc
- cả hai đều lẻ.

## Dữ liệu vào

Gồm 2 dòng:

- Dòng 1 chứa số tự nhiên \`M\`
- Dòng 2 chứa số tự nhiên \`N\`

## Dữ liệu ra

In một trong hai kết quả:

\`\`\`text
DUNG
\`\`\`

hoặc

\`\`\`text
SAI
\`\`\`

## Ví dụ

Input:

\`\`\`text
10
20
\`\`\`

Output:

\`\`\`text
DUNG
\`\`\`

## Lưu ý

Khi nộp bài trên hệ thống, chỉ in đúng kết quả yêu cầu.
Không in các dòng như “Nhập n:”, “nhập a:”, “nhập b:”, “nhập c:”.
Không in dòng \`Nhap M:\` hoặc \`Nhap N:\`.
Chỉ in đúng kết quả.`,
    testcases: [
      { input: "10\n20\n", output: "DUNG\n", isPublic: true, weight: 1 },
      { input: "3\n5\n", output: "DUNG\n", isPublic: true, weight: 1 },
      { input: "2\n3\n", output: "SAI\n", isPublic: true, weight: 1 },
      { input: "1\n2\n", output: "SAI\n", isPublic: false, weight: 2 },
      { input: "100\n200\n", output: "DUNG\n", isPublic: false, weight: 2 },
      { input: "99\n101\n", output: "DUNG\n", isPublic: false, weight: 2 },
      { input: "999\n1000\n", output: "SAI\n", isPublic: false, weight: 2 },
      { input: "0\n8\n", output: "DUNG\n", isPublic: false, weight: 3 },
      { input: "0\n7\n", output: "SAI\n", isPublic: false, weight: 3 }
    ]
  },
  {
    slug: "bai-23-kiem-tra-uoc-cua-nhau",
    title: "Bài 23: Kiểm tra hai số có phải là ước của nhau không",
    difficulty: "Dễ",
    rating: 800,
    source: "SimpleOJ - Bài tập cơ bản",
    orderIndex: 23,
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    maxScore: 100,
    passingScore: 100,
    compareMode: "token",
    numberTolerance: 1e-6,
    isActive: true,
    starterCode: "# Viet chuong trinh cua em o day\n",
    examples: [
      {
        input: "5\n10\n",
        output: "10 khong la uoc cua 5\n5 la uoc cua 10\n",
        explanation: "10 không chia hết cho 5, còn 10 chia hết cho 5."
      }
    ],
    description: `# Bài 23: Kiểm tra hai số có phải là ước của nhau không

Viết chương trình nhập vào hai số nguyên dương \`a\` và \`b\`.

Hãy kiểm tra:

- \`b\` có phải là ước của \`a\` không.
- \`a\` có phải là ước của \`b\` không.

## Dữ liệu vào

Gồm 2 dòng:

- Dòng 1 chứa số nguyên dương \`a\`
- Dòng 2 chứa số nguyên dương \`b\`

## Dữ liệu ra

In đúng 2 dòng.

Dòng 1 kiểm tra \`b\` có phải là ước của \`a\` không:

\`\`\`text
b la uoc cua a
\`\`\`

hoặc

\`\`\`text
b khong la uoc cua a
\`\`\`

Dòng 2 kiểm tra \`a\` có phải là ước của \`b\` không:

\`\`\`text
a la uoc cua b
\`\`\`

hoặc

\`\`\`text
a khong la uoc cua b
\`\`\`

Trong đó \`a\`, \`b\` là giá trị đã nhập.

## Ví dụ

Input:

\`\`\`text
5
10
\`\`\`

Output:

\`\`\`text
10 khong la uoc cua 5
5 la uoc cua 10
\`\`\`

## Lưu ý

Khi nộp bài trên hệ thống, chỉ in đúng kết quả yêu cầu.
Không in các dòng như “Nhập n:”, “nhập a:”, “nhập b:”, “nhập c:”.
Không in dòng \`nhap a:\` hoặc \`nhap b:\`.
Chỉ in đúng 2 dòng kết quả.`,
    testcases: [
      { input: "5\n10\n", output: "10 khong la uoc cua 5\n5 la uoc cua 10\n", isPublic: true, weight: 1 },
      { input: "10\n5\n", output: "5 la uoc cua 10\n10 khong la uoc cua 5\n", isPublic: true, weight: 1 },
      { input: "6\n3\n", output: "3 la uoc cua 6\n6 khong la uoc cua 3\n", isPublic: false, weight: 2 },
      { input: "3\n6\n", output: "6 khong la uoc cua 3\n3 la uoc cua 6\n", isPublic: false, weight: 2 },
      { input: "7\n7\n", output: "7 la uoc cua 7\n7 la uoc cua 7\n", isPublic: false, weight: 2 },
      { input: "8\n12\n", output: "12 khong la uoc cua 8\n8 khong la uoc cua 12\n", isPublic: false, weight: 3 },
      { input: "1\n9\n", output: "9 khong la uoc cua 1\n1 la uoc cua 9\n", isPublic: false, weight: 3 },
      { input: "9\n1\n", output: "1 la uoc cua 9\n9 khong la uoc cua 1\n", isPublic: false, weight: 3 },
      { input: "100\n25\n", output: "25 la uoc cua 100\n100 khong la uoc cua 25\n", isPublic: false, weight: 2 },
      { input: "25\n100\n", output: "100 khong la uoc cua 25\n25 la uoc cua 100\n", isPublic: false, weight: 2 }
    ]
  },
  {
    slug: "bai-24-tim-gia-tri-nho-nhat",
    title: "Bài 24: Tìm giá trị nhỏ nhất trong hai số",
    difficulty: "Dễ",
    rating: 800,
    source: "SimpleOJ - Bài tập cơ bản",
    orderIndex: 24,
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    maxScore: 100,
    passingScore: 100,
    compareMode: "token",
    numberTolerance: 1e-6,
    isActive: true,
    starterCode: "# Viet chuong trinh cua em o day\n",
    examples: [
      {
        input: "5\n10\n",
        output: "5 la gia tri nho nhat\n",
        explanation: "5 nhỏ hơn 10."
      }
    ],
    description: `# Bài 24: Tìm giá trị nhỏ nhất trong hai số

Viết chương trình nhập vào hai số nguyên \`a\` và \`b\`.

Hãy tìm giá trị nhỏ nhất trong hai số đó.

## Dữ liệu vào

Gồm 2 dòng:

- Dòng 1 chứa số nguyên \`a\`
- Dòng 2 chứa số nguyên \`b\`

## Dữ liệu ra

In kết quả theo dạng:

\`\`\`text
x la gia tri nho nhat
\`\`\`

Trong đó \`x\` là giá trị nhỏ nhất trong hai số \`a\` và \`b\`.

## Ví dụ

Input:

\`\`\`text
5
10
\`\`\`

Output:

\`\`\`text
5 la gia tri nho nhat
\`\`\`

## Lưu ý

Khi nộp bài trên hệ thống, chỉ in đúng kết quả yêu cầu.
Không in các dòng như “Nhập n:”, “nhập a:”, “nhập b:”, “nhập c:”.
Không in dòng \`nhap a:\` hoặc \`nhap b:\`.
Chỉ in đúng kết quả.`,
    testcases: [
      { input: "5\n10\n", output: "5 la gia tri nho nhat\n", isPublic: true, weight: 1 },
      { input: "10\n5\n", output: "5 la gia tri nho nhat\n", isPublic: true, weight: 1 },
      { input: "7\n7\n", output: "7 la gia tri nho nhat\n", isPublic: true, weight: 1 },
      { input: "-1\n5\n", output: "-1 la gia tri nho nhat\n", isPublic: false, weight: 2 },
      { input: "5\n-1\n", output: "-1 la gia tri nho nhat\n", isPublic: false, weight: 2 },
      { input: "-10\n-20\n", output: "-20 la gia tri nho nhat\n", isPublic: false, weight: 2 },
      { input: "0\n0\n", output: "0 la gia tri nho nhat\n", isPublic: false, weight: 2 },
      { input: "1000000000\n-1000000000\n", output: "-1000000000 la gia tri nho nhat\n", isPublic: false, weight: 3 },
      { input: "123\n456\n", output: "123 la gia tri nho nhat\n", isPublic: false, weight: 2 },
      { input: "456\n123\n", output: "123 la gia tri nho nhat\n", isPublic: false, weight: 2 }
    ]
  }
];

const tablesToReset = [
  'student_problem_assignments',
  'problem_assignment_targets',
  'problem_assignments',
  'user_problem_progress',
  'submissions',
  'attempts',
  'problem_group_items',
  'problem_groups',
  'problem_testcases',
  'problems'
];

function isLocalDatabaseUrl(url) {
  const value = String(url || '').toLowerCase();
  return (
    value.includes('localhost') ||
    value.includes('127.0.0.1') ||
    value.includes('host.docker.internal') ||
    value.includes('simpleoj_test')
  );
}

function assertSafeToApply(isApply) {
  if (!isApply) return;

  const dbUrl = process.env.DATABASE_URL || '';
  const allowRealReset = process.env.ALLOW_REAL_DB_RESET === 'true';
  const confirmed = process.env.CONFIRM_RESET_BASIC_PROBLEMS === 'YES';

  if (isLocalDatabaseUrl(dbUrl)) return;

  if (allowRealReset && confirmed) {
    console.warn('⚠️ Running destructive reset against non-local DB because ALLOW_REAL_DB_RESET=true and CONFIRM_RESET_BASIC_PROBLEMS=YES.');
    return;
  }

  throw new Error(
    'Refusing to run --apply against non-local database. ' +
    'Use a local/test database, or set ALLOW_REAL_DB_RESET=true and CONFIRM_RESET_BASIC_PROBLEMS=YES intentionally.'
  );
}

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = args.includes('--dry-run') || !isApply;

  assertSafeToApply(isApply);

  if (isApply) {
    console.log('🚀 Running in APPLY mode: Database modifications will be committed.');
  } else {
    console.log('🔍 Running in DRY-RUN mode: No database modifications will be made.');
  }

  const timestamp = getTimestamp();

  if (isApply) {
    console.log('📦 Creating safety backups of existing tables...');
    try {
      await fs.mkdir(path.join(process.cwd(), 'backups'), { recursive: true });
      for (const table of tablesToReset) {
        const exists = await checkIfTableExists(pool, table);
        if (!exists) {
          console.log(`- Table "${table}" does not exist, skipping backup.`);
          continue;
        }

        const res = await pool.query(`SELECT * FROM ${table}`);
        const backupFile = `${table}-reset-${timestamp}.json`;
        const backupPath = path.join(process.cwd(), 'backups', backupFile);
        await fs.writeFile(backupPath, JSON.stringify(res.rows, null, 2), 'utf8');
        console.log(`- Backed up ${table} to backups/${backupFile} (${res.rows.length} rows)`);
      }
      console.log('✅ Backups completed successfully.');
    } catch (err) {
      console.error('❌ Backup failed. Aborting reset.', err);
      process.exit(1);
    }
  }

  if (isDryRun) {
    console.log('\n--- DRY-RUN SUMMARY ---');
    console.log('Tables that would be reset and row counts to delete:');
    for (const table of tablesToReset) {
      const exists = await checkIfTableExists(pool, table);
      if (exists) {
        const res = await pool.query(`SELECT COUNT(*)::int FROM ${table}`);
        console.log(`  - ${table}: ${res.rows[0].count} rows`);
      } else {
        console.log(`  - ${table}: Table does not exist (skip)`);
      }
    }
    console.log('\nProblem Group that would be created:');
    console.log(`  - Name: "${groupDefinition.name}" (slug: "${groupDefinition.slug}")`);
    
    console.log('\nProblems that would be created:');
    for (const p of problemsDefinition) {
      console.log(`  - ${p.title} (slug: "${p.slug}", testcases: ${p.testcases.length})`);
    }
    console.log('\nNo changes were made. Run with --apply to execute.');
    await pool.end();
    return;
  }

  // Execute inside a transaction
  try {
    console.log('\n🔥 Starting transaction...');
    await transaction(async (client) => {
      // 1. Delete in safe order to satisfy FK constraints
      for (const table of tablesToReset) {
        const exists = await checkIfTableExists(client, table);
        if (exists) {
          console.log(`- Deleting all rows from ${table}...`);
          await client.query(`DELETE FROM ${table}`);
        }
      }

      // Verify deletion
      console.log('- Verifying all tables are empty...');
      for (const table of tablesToReset) {
        const exists = await checkIfTableExists(client, table);
        if (exists) {
          const res = await client.query(`SELECT COUNT(*)::int FROM ${table}`);
          const count = res.rows[0].count;
          if (count !== 0) {
            throw new Error(`Deletion verification failed: ${table} still has ${count} rows!`);
          }
        }
      }
      console.log('✅ Verification: All tables successfully reset to 0 rows.');

      // 2. Fetch admin user
      const adminRes = await client.query("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1");
      const createdBy = adminRes.rows[0]?.id || null;
      if (!createdBy) {
        console.log('⚠️ Warning: No ADMIN user found in database. Using NULL for creator.');
      } else {
        console.log(`- Associating new problems with admin user ID: ${createdBy}`);
      }

      // 3. Create problem group
      console.log(`- Inserting problem group: "${groupDefinition.name}"`);
      const groupRes = await client.query(
        `INSERT INTO problem_groups (slug, name, description, group_type, order_index, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          groupDefinition.slug,
          groupDefinition.name,
          groupDefinition.description,
          groupDefinition.groupType,
          groupDefinition.orderIndex,
          groupDefinition.isActive,
          createdBy
        ]
      );
      const groupId = groupRes.rows[0].id;

      // 4. Create problems and testcases
      for (const p of problemsDefinition) {
        console.log(`- Inserting problem: "${p.title}"`);
        const probRes = await client.query(
          `INSERT INTO problems (
             slug, title, difficulty, rating, max_score, passing_score, 
             source, order_index, description, starter_code, examples, 
             time_limit_minutes, execution_limit_ms, is_active, created_by,
             compare_mode, number_tolerance
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17)
           RETURNING id`,
          [
            p.slug,
            p.title,
            p.difficulty,
            p.rating,
            p.maxScore,
            p.passingScore,
            p.source,
            p.orderIndex,
            p.description,
            p.starterCode,
            JSON.stringify(p.examples),
            p.timeLimitMinutes,
            p.executionLimitMs,
            p.isActive,
            createdBy,
            p.compareMode,
            p.numberTolerance
          ]
        );
        const problemId = probRes.rows[0].id;

        // Link to group
        await client.query(
          `INSERT INTO problem_group_items (group_id, problem_id, added_by, order_index)
           VALUES ($1, $2, $3, $4)`,
          [groupId, problemId, createdBy, p.orderIndex]
        );

        // Insert test cases
        for (let i = 0; i < p.testcases.length; i++) {
          const tc = p.testcases[i];
          await client.query(
            `INSERT INTO problem_testcases (problem_id, input, expected_output, is_public, weight, order_index)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [problemId, tc.input, tc.output, tc.isPublic, tc.weight, i]
          );
        }
        console.log(`  -> Inserted ${p.testcases.length} testcases for ${p.slug}`);
      }

      // 5. Post-apply integrity validations
      console.log('🔍 Running post-apply validation checks...');
      
      // Check 10.1: Exactly one active group
      const activeGroups = await client.query(`
        SELECT slug, name, COUNT(*) 
        FROM problem_groups 
        WHERE is_active = TRUE 
        GROUP BY slug, name
      `);
      if (activeGroups.rows.length !== 1 || activeGroups.rows[0].slug !== 'bai-tap-co-ban') {
        throw new Error(`Validation failed: Expected exactly 1 active group 'bai-tap-co-ban', but found: ${JSON.stringify(activeGroups.rows)}`);
      }

      // Check 10.2: Exactly 5 active problems
      const activeProbs = await client.query(`
        SELECT slug, title, order_index 
        FROM problems 
        WHERE is_active = TRUE 
        ORDER BY order_index
      `);
      if (activeProbs.rows.length !== 5) {
        throw new Error(`Validation failed: Expected exactly 5 active problems, but found ${activeProbs.rows.length}`);
      }
      const expectedSlugs = [
        'bai-20-giai-phuong-trinh-bac-hai',
        'bai-21-kiem-tra-chan-le',
        'bai-22-cung-tinh-chan-le',
        'bai-23-kiem-tra-uoc-cua-nhau',
        'bai-24-tim-gia-tri-nho-nhat'
      ];
      for (let i = 0; i < 5; i++) {
        if (activeProbs.rows[i].slug !== expectedSlugs[i]) {
          throw new Error(`Validation failed: Problem at index ${i} has slug "${activeProbs.rows[i].slug}", expected "${expectedSlugs[i]}"`);
        }
      }

      // Check 10.3: No orphan active problems
      const orphans = await client.query(`
        SELECT p.id, p.slug, p.title 
        FROM problems p
        LEFT JOIN problem_group_items pgi ON pgi.problem_id = p.id
        LEFT JOIN problem_groups g ON g.id = pgi.group_id AND g.is_active = TRUE
        WHERE p.is_active = TRUE
        GROUP BY p.id, p.slug, p.title
        HAVING COUNT(g.id) = 0
      `);
      if (orphans.rows.length > 0) {
        throw new Error(`Validation failed: Found orphan active problems: ${JSON.stringify(orphans.rows)}`);
      }

      // Check 10.4: No empty active groups
      const emptyGroups = await client.query(`
        SELECT g.id, g.slug, g.name
        FROM problem_groups g
        LEFT JOIN problem_group_items pgi ON pgi.group_id = g.id
        LEFT JOIN problems p ON p.id = pgi.problem_id AND p.is_active = TRUE
        WHERE g.is_active = TRUE
        GROUP BY g.id, g.slug, g.name
        HAVING COUNT(p.id) = 0
      `);
      if (emptyGroups.rows.length > 0) {
        throw new Error(`Validation failed: Found empty active groups: ${JSON.stringify(emptyGroups.rows)}`);
      }

      // Check 10.5: Learning data reset check
      const subCount = await client.query('SELECT COUNT(*)::int FROM submissions');
      const attCount = await client.query('SELECT COUNT(*)::int FROM attempts');
      const progCount = await client.query('SELECT COUNT(*)::int FROM user_problem_progress');
      const assignCount = await client.query('SELECT COUNT(*)::int FROM student_problem_assignments');
      if (subCount.rows[0].count !== 0 || attCount.rows[0].count !== 0 || progCount.rows[0].count !== 0 || assignCount.rows[0].count !== 0) {
        throw new Error(`Validation failed: Learning data is not fully reset! subCount=${subCount.rows[0].count}, attCount=${attCount.rows[0].count}, progCount=${progCount.rows[0].count}, assignCount=${assignCount.rows[0].count}`);
      }

      console.log('✅ Post-apply integrity validations all PASSED.');
    });
    console.log('🎉 Reset and seed completed and committed successfully.');
  } catch (err) {
    console.error('❌ Transaction failed and rolled back:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
