import { query, transaction, pool } from './src/db.js';
import { normalizeProblem } from './src/validation.js';

const rawProblems = [
  {
    slug: 'bai-1-2-chia-qua',
    title: 'Bài 1.2: Tính tiền mua quà chia đều',
    difficulty: 'Dễ',
    rating: 800,
    max_score: 100,
    passing_score: 100,
    description: `Để chuẩn bị quà khen thưởng, giáo viên mua một số hộp quà với tổng số tiền là $T$ đồng (số thực). Hãy nhập sĩ số lớp $N$ (số nguyên) và tổng số tiền $T$ (số thực). Tính trung bình mỗi bạn trong lớp sẽ được nhận phần quà trị giá bao nhiêu tiền?

### Định dạng dữ liệu đầu vào:
* Dòng 1: Số nguyên $N$ ($1 \\le N \\le 1000$) — sĩ số lớp.
* Dòng 2: Số thực $T$ ($0 \\le T \\le 10^9$) — tổng số tiền mua quà.

### Định dạng dữ liệu đầu ra:
* In ra một dòng duy nhất theo định dạng: \`Trung binh moi hoc sinh nhan qua tri gia: <gia_tri> dong.\`

### Ví dụ:
**Đầu vào:**
\`\`\`
40
500000.5
\`\`\`
**Đầu ra:**
\`\`\`
Trung binh moi hoc sinh nhan qua tri gia: 12500.0125 dong.
\`\`\`
`,
    template: `# Nhập sĩ số lớp N (số nguyên)
N = int(input())
# Nhập tổng số tiền T (số thực)
T = float(input())

# Hãy tính toán và in ra kết quả trung bình trị giá quà mỗi học sinh nhận được
`,
    examples: [
      {
        input: "40\n500000.5",
        output: "Trung binh moi hoc sinh nhan qua tri gia: 12500.0125 dong.",
        explanation: "Tổng số tiền là 500000.5 chia cho sĩ số 40 học sinh được 12500.0125."
      }
    ],
    testcases: [
      { input: "40\n500000.5", output: "Trung binh moi hoc sinh nhan qua tri gia: 12500.0125 dong.", is_public: true },
      { input: "30\n300000.0", output: "Trung binh moi hoc sinh nhan qua tri gia: 10000.0 dong.", is_public: false },
      { input: "45\n900000.0", output: "Trung binh moi hoc sinh nhan qua tri gia: 20000.0 dong.", is_public: false },
      { input: "13\n150000.25", output: "Trung binh moi hoc sinh nhan qua tri gia: 11538.48076923077 dong.", is_public: false },
      { input: "1\n99.9", output: "Trung binh moi hoc sinh nhan qua tri gia: 99.9 dong.", is_public: false }
    ]
  },
  {
    slug: 'bai-1-3-so-sanh-nam-nu',
    title: 'Bài 1.3: So sánh số lượng Nam và Nữ',
    difficulty: 'Dễ',
    rating: 800,
    max_score: 100,
    passing_score: 100,
    description: `Nhập sĩ số lớp $N$ (số nguyên) và số học sinh Nam trong lớp (số nguyên). Hãy kiểm tra xem số bạn Nam hay số bạn Nữ trong lớp nhiều hơn và in kết quả ra màn hình.

* Nếu số bạn Nữ nhiều hơn số bạn Nam, in ra: \`Số bạn Nữ nhiều hơn số bạn Nam.\`
* Nếu số bạn Nam nhiều hơn số bạn Nữ, in ra: \`Số bạn Nam nhiều hơn số bạn Nữ.\`
* Nếu hai bên bằng nhau, in ra: \`Số bạn Nam bằng số bạn Nữ.\`

### Định dạng dữ liệu đầu vào:
* Dòng 1: Số nguyên $N$ ($1 \\le N \\le 1000$) — sĩ số lớp.
* Dòng 2: Số nguyên $M$ ($0 \\le M \\le N$) — số học sinh Nam.

### Định dạng dữ liệu đầu ra:
* In ra màn hình dòng thông báo so sánh tương ứng.

### Ví dụ:
**Đầu vào:**
\`\`\`
35
15
\`\`\`
**Đầu ra:**
\`\`\`
Số bạn Nữ nhiều hơn số bạn Nam.
\`\`\`
`,
    template: `# Nhập sĩ số lớp N
N = int(input())
# Nhập số bạn Nam
nam = int(input())

# Hãy kiểm tra xem số bạn Nam hay số bạn Nữ nhiều hơn và in kết quả ra màn hình
`,
    examples: [
      {
        input: "35\n15",
        output: "Số bạn Nữ nhiều hơn số bạn Nam.",
        explanation: "Sĩ số 35, Nam 15 nên Nữ = 20. Số Nữ (20) nhiều hơn số Nam (15)."
      }
    ],
    testcases: [
      { input: "35\n15", output: "Số bạn Nữ nhiều hơn số bạn Nam.", is_public: true },
      { input: "35\n20", output: "Số bạn Nam nhiều hơn số bạn Nữ.", is_public: false },
      { input: "30\n15", output: "Số bạn Nam bằng số bạn Nữ.", is_public: false },
      { input: "40\n0", output: "Số bạn Nữ nhiều hơn số bạn Nam.", is_public: false },
      { input: "40\n40", output: "Số bạn Nam nhiều hơn số bạn Nữ.", is_public: false }
    ]
  },
  {
    slug: 'bai-2-2-chu-vi-manh-vuon',
    title: 'Bài 2.2: Tính chu vi mảnh vườn làm tròn',
    difficulty: 'Dễ',
    rating: 800,
    max_score: 100,
    passing_score: 100,
    description: `Nhập vào hai số thực $a$ và $b$ lần lượt là chiều dài và chiều rộng của một khu vườn hình chữ nhật. Hãy tính chu vi của khu vườn đó dưới dạng số thực, sau đó in thêm kết quả chu vi đã được làm tròn xuống dưới dạng số nguyên (bằng cách ép kiểu \`int()\`).

### Định dạng dữ liệu đầu vào:
* Dòng 1: Số thực $a$ ($a > 0$) — chiều dài khu vườn.
* Dòng 2: Số thực $b$ ($b > 0$) — chiều rộng khu vườn.

### Định dạng dữ liệu đầu ra:
* Dòng 1: \`Chu vi (so thuc): <gia_tri_so_thuc>\`
* Dòng 2: \`Chu vi (so nguyen): <gia_tri_so_nguyen>\`

### Ví dụ:
**Đầu vào:**
\`\`\`
10.5
4.2
\`\`\`
**Đầu ra:**
\`\`\`
Chu vi (so thuc): 29.4
Chu vi (so nguyen): 29
\`\`\`
`,
    template: `# Nhập chiều dài a và chiều rộng b
a = float(input())
b = float(input())

# Tính chu vi thực và chu vi làm tròn xuống dưới dạng số nguyên rồi in ra màn hình
`,
    examples: [
      {
        input: "10.5\n4.2",
        output: "Chu vi (so thuc): 29.4\nChu vi (so nguyen): 29",
        explanation: "Chu vi thực = (10.5 + 4.2) * 2 = 29.4. Chu vi làm tròn xuống = int(29.4) = 29."
      }
    ],
    testcases: [
      { input: "10.5\n4.2", output: "Chu vi (so thuc): 29.4\nChu vi (so nguyen): 29", is_public: true },
      { input: "5.0\n3.0", output: "Chu vi (so thuc): 16.0\nChu vi (so nguyen): 16", is_public: false },
      { input: "2.25\n1.15", output: "Chu vi (so thuc): 6.8\nChu vi (so nguyen): 6", is_public: false },
      { input: "100.123\n50.456", output: "Chu vi (so thuc): 301.158\nChu vi (so nguyen): 301", is_public: false },
      { input: "0.5\n0.25", output: "Chu vi (so thuc): 1.5\nChu vi (so nguyen): 1", is_public: false }
    ]
  },
  {
    slug: 'bai-2-3-kiem-tra-chia-het',
    title: 'Bài 2.3: Kiểm tra chia hết',
    difficulty: 'Dễ',
    rating: 800,
    max_score: 100,
    passing_score: 100,
    description: `Nhập vào 2 số nguyên $a$ và $b$. Kiểm tra xem $a$ có chia hết cho $b$ hay không.

* Nếu có, in ra: \`a chia het cho b\`
* Nếu không, in ra: \`a khong chia het cho b\`

### Định dạng dữ liệu đầu vào:
* Dòng 1: Số nguyên $a$.
* Dòng 2: Số nguyên $b$ ($b \\ne 0$).

### Định dạng dữ liệu đầu ra:
* In ra màn hình kết quả thông báo tương ứng.

### Ví dụ:
**Đầu vào:**
\`\`\`
10
3
\`\`\`
**Đầu ra:**
\`\`\`
a khong chia het cho b
\`\`\`
`,
    template: `# Nhập a và b
a = int(input())
b = int(input())

# Kiểm tra xem a có chia hết cho b hay không và in thông báo ra màn hình
`,
    examples: [
      {
        input: "10\n3",
        output: "a khong chia het cho b",
        explanation: "10 không chia hết cho 3."
      }
    ],
    testcases: [
      { input: "10\n3", output: "a khong chia het cho b", is_public: true },
      { input: "12\n4", output: "a chia het cho b", is_public: false },
      { input: "-15\n5", output: "a chia het cho b", is_public: false },
      { input: "0\n7", output: "a chia het cho b", is_public: false },
      { input: "7\n10", output: "a khong chia het cho b", is_public: false }
    ]
  },
  {
    slug: 'bai-3-2-doi-met-sang-cm',
    title: 'Bài 3.2: Chuyển đổi mét sang centimet',
    difficulty: 'Dễ',
    rating: 800,
    max_score: 100,
    passing_score: 100,
    description: `Nhập vào chiều cao của một bạn học sinh dưới dạng số thực với đơn vị là mét (ví dụ: 1.35m). Hãy đổi chiều cao đó sang đơn vị centimet (dưới dạng số nguyên) bằng cách nhân với 100 và sử dụng hàm \`int()\`.

### Định dạng dữ liệu đầu vào:
* Một dòng chứa số thực $h$ ($0 < h < 3.0$) — chiều cao tính bằng mét.

### Định dạng dữ liệu đầu ra:
* In ra kết quả dưới dạng: \`Chieu cao cua ban la: <gia_tri_cm> cm.\`

### Ví dụ:
**Đầu vào:**
\`\`\`
1.42
\`\`\`
**Đầu ra:**
\`\`\`
Chieu cao cua ban la: 142 cm.
\`\`\`
`,
    template: `# Nhập chiều cao tính bằng mét (số thực)
h = float(input())

# Đổi sang centimet (số nguyên) và in ra màn hình đúng định dạng
`,
    examples: [
      {
        input: "1.42",
        output: "Chieu cao cua ban la: 142 cm.",
        explanation: "1.42 mét = 1.42 * 100 = 142 cm."
      }
    ],
    testcases: [
      { input: "1.42", output: "Chieu cao cua ban la: 142 cm.", is_public: true },
      { input: "1.35", output: "Chieu cao cua ban la: 135 cm.", is_public: false },
      { input: "1.7", output: "Chieu cao cua ban la: 170 cm.", is_public: false },
      { input: "0.85", output: "Chieu cao cua ban la: 85 cm.", is_public: false },
      { input: "2.05", output: "Chieu cao cua ban la: 205 cm.", is_public: false }
    ]
  },
  {
    slug: 'bai-3-3-sap-xep-hai-so',
    title: 'Bài 3.3: Sắp xếp hai số',
    difficulty: 'Dễ',
    rating: 800,
    max_score: 100,
    passing_score: 100,
    description: `Nhập vào hai số nguyên $a$ và $b$. Nếu $a > b$, hãy hoán đổi giá trị của chúng để $a$ nhận giá trị nhỏ hơn và $b$ nhận giá trị lớn hơn. In ra giá trị của $a$ và $b$ sau khi đã sắp xếp.

### Định dạng dữ liệu đầu vào:
* Dòng 1: Số nguyên $a$.
* Dòng 2: Số nguyên $b$.

### Định dạng dữ liệu đầu ra:
* In ra kết quả dưới dạng: \`Sau khi sap xep: a = <gia_tri_a>, b = <gia_tri_b>\`

### Ví dụ:
**Đầu vào:**
\`\`\`
8
3
\`\`\`
**Đầu ra:**
\`\`\`
Sau khi sap xep: a = 3, b = 8
\`\`\`
`,
    template: `# Nhập hai số nguyên a và b
a = int(input())
b = int(input())

# Hoán đổi giá trị nếu a > b để sắp xếp tăng dần và in ra màn hình
`,
    examples: [
      {
        input: "8\n3",
        output: "Sau khi sap xep: a = 3, b = 8",
        explanation: "8 > 3 nên hoán đổi để a=3, b=8."
      }
    ],
    testcases: [
      { input: "8\n3", output: "Sau khi sap xep: a = 3, b = 8", is_public: true },
      { input: "3\n8", output: "Sau khi sap xep: a = 3, b = 8", is_public: false },
      { input: "5\n5", output: "Sau khi sap xep: a = 5, b = 5", is_public: false },
      { input: "-10\n20", output: "Sau khi sap xep: a = -10, b = 20", is_public: false },
      { input: "50\n-50", output: "Sau khi sap xep: a = -50, b = 50", is_public: false }
    ]
  }
];

async function run() {
  try {
    const adminRes = await query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    const adminId = adminRes.rows[0]?.id || null;

    if (!adminId) {
      throw new Error("Không tìm thấy người dùng ADMIN nào trong database để sở hữu bài tập.");
    }

    console.log(`Đang sử dụng Admin ID: ${adminId} làm người tạo bài.`);

    await transaction(async (client) => {
      for (const raw of rawProblems) {
        // Normalize using validation rules
        const p = normalizeProblem({
          slug: raw.slug,
          title: raw.title,
          difficulty: raw.difficulty,
          rating: raw.rating,
          maxScore: raw.max_score,
          passingScore: raw.passing_score,
          description: raw.description,
          starterCode: raw.template,
          examples: raw.examples,
          testcases: raw.testcases,
          isActive: true
        });

        console.log(`Đang xử lý bài: ${p.title} (${p.slug})`);

        // Upsert to problems
        const { rows } = await client.query(
          `INSERT INTO problems(slug,title,difficulty,rating,max_score,passing_score,published_at,source,order_index,description,starter_code,examples,time_limit_minutes,execution_limit_ms,is_active,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
           ON CONFLICT(slug) DO UPDATE SET
             title=EXCLUDED.title,
             difficulty=EXCLUDED.difficulty,
             rating=EXCLUDED.rating,
             max_score=EXCLUDED.max_score,
             passing_score=EXCLUDED.passing_score,
             published_at=EXCLUDED.published_at,
             source=EXCLUDED.source,
             order_index=EXCLUDED.order_index,
             description=EXCLUDED.description,
             starter_code=EXCLUDED.starter_code,
             examples=EXCLUDED.examples,
             time_limit_minutes=EXCLUDED.time_limit_minutes,
             execution_limit_ms=EXCLUDED.execution_limit_ms,
             is_active=EXCLUDED.is_active,
             updated_at=NOW()
           RETURNING id`,
          [p.slug, p.title, p.difficulty, p.rating, p.maxScore, p.passingScore, p.publishedAt, p.source, p.orderIndex,
            p.description, p.starterCode, JSON.stringify(p.examples), p.timeLimitMinutes, p.executionLimitMs, p.isActive, adminId]
        );

        const problemId = rows[0].id;
        
        // Clear old testcases
        await client.query('DELETE FROM problem_testcases WHERE problem_id=$1', [problemId]);

        // Insert new testcases
        for (const tc of p.testcases) {
          await client.query(
            `INSERT INTO problem_testcases(problem_id, input, expected_output, explanation, is_public, weight, order_index)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [problemId, tc.input, tc.output, tc.explanation, tc.isPublic, tc.weight, tc.orderIndex]
          );
        }
        console.log(`-> Đã lưu bài và ${p.testcases.length} testcases thành công.`);
      }
    });

    console.log("\n=== TẤT CẢ BÀI TẬP ĐÃ ĐƯỢC CẬP NHẬT TEMPLATE THÀNH CÔNG ===");
  } catch (err) {
    console.error("Lỗi khi import bài tập:", err);
  } finally {
    await pool.end();
  }
}

run();
