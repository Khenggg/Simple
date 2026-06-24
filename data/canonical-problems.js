export const canonicalProblems = [
  {
    slug: 'sum',
    title: 'Tính tổng hai số',
    difficulty: 'Dễ',
    rating: 800,
    source: 'SimpleOJ Starter',
    description: `Viết chương trình nhập vào hai số nguyên $a$ và $b$ (cách nhau bởi một khoảng trắng) từ bàn phím. In ra màn hình tổng của hai số đó.

### Định dạng dữ liệu đầu vào:
* Một dòng duy nhất chứa hai số nguyên $a$ và $b$ ($-10^9 \\le a, b \\le 10^9$).

### Định dạng dữ liệu đầu ra:
* In ra một số nguyên duy nhất là tổng của $a$ và $b$.`,
    examples: [
      { input: '3 5\n', output: '8\n', explanation: 'Tổng của 3 và 5 là 8.' },
      { input: '-2 10\n', output: '8\n', explanation: 'Tổng của -2 và 10 là 8.' }
    ],
    starterCode: `# Nhập dữ liệu đầu vào và chuyển thành số nguyên
a, b = map(int, input().split())

# Tính toán và in kết quả
print(a + b)
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 1,
    testcases: [
      { input: '3 5\n', output: '8\n', isPublic: true, weight: 1, orderIndex: 0 },
      { input: '-2 10\n', output: '8\n', isPublic: true, weight: 1, orderIndex: 1 },
      { input: '0 0\n', output: '0\n', isPublic: false, weight: 1, orderIndex: 2 },
      { input: '999999 1\n', output: '1000000\n', isPublic: false, weight: 1, orderIndex: 3 },
      { input: '-100 -200\n', output: '-300\n', isPublic: false, weight: 1, orderIndex: 4 },
      { input: '1000000000 1000000000\n', output: '2000000000\n', isPublic: false, weight: 2, orderIndex: 5 },
      { input: '-1000000000 1000000000\n', output: '0\n', isPublic: false, weight: 2, orderIndex: 6 },
      { input: '-1000000000 -1000000000\n', output: '-2000000000\n', isPublic: false, weight: 2, orderIndex: 7 }
    ]
  },
  {
    slug: 'cf-4a-watermelon',
    title: 'Chia dưa hấu (Watermelon)',
    difficulty: 'Dễ',
    rating: 800,
    source: 'Codeforces 4A - Watermelon',
    description: `Pete và Billy mua được một quả dưa hấu nặng $w$ kg. Họ rất thích các số chẵn và muốn chia quả dưa hấu này thành **hai phần đều có cân nặng là số chẵn dương** (không nhất thiết phải bằng nhau). 

Hãy giúp họ kiểm tra xem có thể chia như vậy được không. Nếu có in ra \`YES\`, ngược lại in ra \`NO\`.

### Định dạng dữ liệu đầu vào:
* Một dòng duy nhất chứa số nguyên $w$ ($1 \\le w \\le 100$) — cân nặng của quả dưa hấu.

### Định dạng dữ liệu đầu ra:
* In ra \`YES\` nếu có thể chia quả dưa thành hai phần có số cân là số chẵn dương. Ngược lại, in ra \`NO\`.`,
    examples: [
      { input: '8\n', output: 'YES\n', explanation: 'Quả dưa hấu nặng 8kg có thể chia thành hai phần nặng 2kg và 6kg (hoặc 4kg và 4kg).' },
      { input: '2\n', output: 'NO\n', explanation: 'Quả dưa hấu nặng 2kg chỉ có thể chia thành hai phần là 1kg và 1kg. Mà số 1 không phải số chẵn, nên kết quả là NO.' }
    ],
    starterCode: `# Nhập cân nặng w của quả dưa
w = int(input())

# Hãy viết code kiểm tra ở đây
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 2,
    testcases: [
      { input: '8\n', output: 'YES\n', isPublic: true, weight: 1, orderIndex: 0 },
      { input: '2\n', output: 'NO\n', isPublic: true, weight: 1, orderIndex: 1 },
      { input: '1\n', output: 'NO\n', isPublic: false, weight: 1, orderIndex: 2 },
      { input: '3\n', output: 'NO\n', isPublic: false, weight: 1, orderIndex: 3 },
      { input: '4\n', output: 'YES\n', isPublic: false, weight: 2, orderIndex: 4 },
      { input: '6\n', output: 'YES\n', isPublic: false, weight: 1, orderIndex: 5 },
      { input: '99\n', output: 'NO\n', isPublic: false, weight: 1, orderIndex: 6 },
      { input: '100\n', output: 'YES\n', isPublic: false, weight: 1, orderIndex: 7 },
      { input: '12\n', output: 'YES\n', isPublic: false, weight: 1, orderIndex: 8 },
      { input: '50\n', output: 'YES\n', isPublic: false, weight: 1, orderIndex: 9 }
    ]
  },
  {
    slug: 'case_count',
    title: 'Đếm chữ Hoa - chữ Thường',
    difficulty: 'Dễ - Trung bình',
    rating: 800,
    source: 'SimpleOJ Starter',
    description: `Viết chương trình nhập vào một chuỗi ký tự $S$ gồm cả chữ hoa, chữ thường và chữ số. Hãy đếm xem có bao nhiêu chữ cái viết hoa và bao nhiêu chữ cái viết thường xuất hiện trong chuỗi.

### Định dạng dữ liệu đầu vào:
* Một dòng duy nhất chứa chuỗi ký tự $S$ (độ dài không quá 100 ký tự).

### Định dạng dữ liệu đầu ra:
* Một dòng chứa hai số nguyên cách nhau bởi khoảng trắng: Số lượng chữ cái viết hoa và số lượng chữ cái viết thường.`,
    examples: [
      { input: 'CodeForces\n', output: '2 8\n', explanation: "Chuỗi 'CodeForces' có 2 chữ hoa ('C', 'F') và 8 chữ thường ('o', 'd', 'e', 'o', 'r', 'c', 'e', 's')." },
      { input: 'Python3.10\n', output: '1 5\n', explanation: "Chuỗi 'Python3.10' có 1 chữ hoa ('P') và 5 chữ thường ('y', 't', 'h', 'o', 'n'). Các chữ số và dấu chấm không được đếm." }
    ],
    starterCode: `# Nhập chuỗi ký tự
s = input()

# Hãy đếm chữ hoa và chữ thường rồi in ra kết quả
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 3,
    testcases: [
      { input: 'CodeForces\n', output: '2 8\n', isPublic: true, weight: 1, orderIndex: 0 },
      { input: 'Python3.10\n', output: '1 5\n', isPublic: true, weight: 1, orderIndex: 1 },
      { input: 'HELLO\n', output: '5 0\n', isPublic: false, weight: 1, orderIndex: 2 },
      { input: 'world\n', output: '0 5\n', isPublic: false, weight: 1, orderIndex: 3 },
      { input: '123456\n', output: '0 0\n', isPublic: false, weight: 1, orderIndex: 4 },
      { input: 'AaBbCc\n', output: '3 3\n', isPublic: false, weight: 2, orderIndex: 5 },
      { input: 'aA1!bB2@cC\n', output: '3 3\n', isPublic: false, weight: 2, orderIndex: 6 },
      { input: 'Z\n', output: '1 0\n', isPublic: false, weight: 1, orderIndex: 7 },
      { input: 'z\n', output: '0 1\n', isPublic: false, weight: 1, orderIndex: 8 },
      { input: 'ShortString\n', output: '2 9\n', isPublic: false, weight: 1, orderIndex: 9 }
    ]
  },
  {
    slug: 'cf-9a-die-roll',
    title: 'Xác suất của Dot',
    difficulty: 'Dễ',
    rating: 800,
    source: 'Codeforces 9A - Die Roll',
    description: `Yakko và Wakko đã tung xúc xắc và nhận được lần lượt Y và W điểm. Dot sẽ thắng nếu số của cô ấy không nhỏ hơn cả hai người kia, vì nếu bằng điểm thì Dot vẫn được tính là thắng.

Hãy in xác suất Dot chiến thắng dưới dạng phân số tối giản A/B. Nếu xác suất bằng 0 hãy in 0/1, nếu bằng 1 hãy in 1/1.

### Định dạng dữ liệu đầu vào:
* Một dòng chứa hai số nguyên Y và W.

### Định dạng dữ liệu đầu ra:
* In ra phân số tối giản biểu diễn xác suất Dot thắng.`,
    examples: [
      { input: '4 2\n', output: '1/2\n', explanation: 'Dot thắng nếu tung được 4, 5 hoặc 6.' },
      { input: '3 3\n', output: '2/3\n', explanation: 'Dot thắng nếu tung được 3, 4, 5 hoặc 6.' }
    ],
    starterCode: `# Nhập Y và W
y, w = map(int, input().split())

# Hãy tính và in ra phân số tối giản
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 4,
    testcases: [
      { input: '4 2\n', output: '1/2\n', isPublic: true, weight: 1, orderIndex: 0 },
      { input: '3 3\n', output: '2/3\n', isPublic: true, weight: 1, orderIndex: 1 },
      { input: '6 6\n', output: '1/6\n', isPublic: false, weight: 1, orderIndex: 2 },
      { input: '1 1\n', output: '1/1\n', isPublic: false, weight: 1, orderIndex: 3 },
      { input: '5 2\n', output: '1/3\n', isPublic: false, weight: 1, orderIndex: 4 },
      { input: '2 5\n', output: '1/3\n', isPublic: false, weight: 1, orderIndex: 5 },
      { input: '1 6\n', output: '1/6\n', isPublic: false, weight: 1, orderIndex: 6 },
      { input: '6 1\n', output: '1/6\n', isPublic: false, weight: 1, orderIndex: 7 },
      { input: '3 4\n', output: '1/2\n', isPublic: false, weight: 2, orderIndex: 8 },
      { input: '5 6\n', output: '1/6\n', isPublic: false, weight: 2, orderIndex: 9 }
    ]
  },
  {
    slug: 'cf-32b-borze',
    title: 'Giải mã Borze',
    difficulty: 'Dễ',
    rating: 800,
    source: 'Codeforces 32B - Borze',
    description: `Mã Borze dùng chuỗi ký hiệu . , -. và -- để biểu diễn số ở hệ tam phân. Quy ước là:
* . tương ứng với 0
* -. tương ứng với 1
* -- tương ứng với 2

Hãy giải mã chuỗi Borze đã cho.

### Định dạng dữ liệu đầu vào:
* Một chuỗi Borze hợp lệ.

### Định dạng dữ liệu đầu ra:
* In ra số tam phân tương ứng.`,
    examples: [
      { input: '.-.--\n', output: '012\n', explanation: 'Chuỗi được đọc lần lượt thành 0, 1, 2.' },
      { input: '--.\n', output: '20\n', explanation: 'Chuỗi được đọc lần lượt thành 2, 0.' }
    ],
    starterCode: `# Nhập chuỗi Borze
s = input()

# Hãy giải mã và in kết quả
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 5,
    testcases: [
      { input: '.-.--\n', output: '012\n', isPublic: true, weight: 1, orderIndex: 0 },
      { input: '--.\n', output: '20\n', isPublic: true, weight: 1, orderIndex: 1 },
      { input: '.\n', output: '0\n', isPublic: false, weight: 1, orderIndex: 2 },
      { input: '-..-.--\n', output: '1012\n', isPublic: false, weight: 1, orderIndex: 3 },
      { input: '----.\n', output: '220\n', isPublic: false, weight: 1, orderIndex: 4 },
      { input: '-.---.\n', output: '121\n', isPublic: false, weight: 1, orderIndex: 5 },
      { input: '...\n', output: '000\n', isPublic: false, weight: 2, orderIndex: 6 },
      { input: '--------\n', output: '2222\n', isPublic: false, weight: 2, orderIndex: 7 },
      { input: '....\n', output: '0000\n', isPublic: false, weight: 2, orderIndex: 8 }
    ]
  },
  {
    slug: 'cf-38a-army',
    title: 'Quân hàm và số năm',
    difficulty: 'Dễ',
    rating: 800,
    source: 'Codeforces 38A - Army',
    description: `Hệ thống quân hàm của Berland có n bậc, đánh số từ 1 đến n. Để đi từ bậc i lên bậc i + 1 cần d_i năm. Vasya vừa đạt bậc a và muốn lên bậc b.

Hãy tính tổng số năm Vasya còn phải phục vụ.

### Định dạng dữ liệu đầu vào:
* Dòng 1 chứa n.
* Dòng 2 chứa n - 1 số nguyên d_i.
* Dòng 3 chứa hai số nguyên a và b.

### Định dạng dữ liệu đầu ra:
* In ra số năm cần thiết để đi từ a lên b.`,
    examples: [
      { input: "3\n5 6\n1 2\n", output: "5\n", explanation: 'Từ bậc 1 lên bậc 2 mất 5 năm.' },
      { input: "4\n1 2 3\n2 4\n", output: "5\n", explanation: 'Từ bậc 2 lên bậc 4 mất 2 + 3 = 5 năm.' }
    ],
    starterCode: `# Viết mã nguồn ở đây
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 6,
    testcases: [
      { input: "3\n5 6\n1 2\n", output: "5\n", isPublic: true, weight: 1, orderIndex: 0 },
      { input: "4\n1 2 3\n2 4\n", output: "5\n", isPublic: true, weight: 1, orderIndex: 1 },
      { input: "3\n5 6\n1 3\n", output: "11\n", isPublic: false, weight: 1, orderIndex: 2 },
      { input: "5\n1 2 3 4\n1 5\n", output: "10\n", isPublic: false, weight: 1, orderIndex: 3 },
      { input: "2\n7\n1 2\n", output: "7\n", isPublic: false, weight: 1, orderIndex: 4 },
      { input: "6\n2 3 4 5 6\n2 5\n", output: "12\n", isPublic: false, weight: 2, orderIndex: 5 },
      { input: "6\n2 3 4 5 6\n1 6\n", output: "20\n", isPublic: false, weight: 2, orderIndex: 6 },
      { input: "10\n1 1 1 1 1 1 1 1 1\n3 8\n", output: "5\n", isPublic: false, weight: 2, orderIndex: 7 }
    ]
  },
  {
    slug: 'cf-41a-translation',
    title: 'Dịch ngược một từ',
    difficulty: 'Dễ',
    rating: 800,
    source: 'Codeforces 41A - Translation',
    description: `Trong ngôn ngữ Berland và Birland, một từ có nghĩa giống nhau nếu nó bị viết ngược lại. Ví dụ code tương ứng với edoc.

Hãy kiểm tra xem từ t có phải là từ s viết ngược hay không.

### Định dạng dữ liệu đầu vào:
* Dòng 1 chứa từ s.
* Dòng 2 chứa từ t.

### Định dạng dữ liệu đầu ra:
* In YES nếu t là s viết ngược, ngược lại in NO.`,
    examples: [
      { input: "code\nedoc\n", output: "YES\n", explanation: 'edoc là code viết ngược.' },
      { input: "abb\naba\n", output: "NO\n", explanation: 'aba không phải là abb viết ngược.' }
    ],
    starterCode: `# Nhập s và t
s = input()
t = input()

# Hãy kiểm tra và in kết quả
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 7,
    testcases: [
      { input: "code\nedoc\n", output: "YES\n", isPublic: true, weight: 1, orderIndex: 0 },
      { input: "abb\naba\n", output: "NO\n", isPublic: true, weight: 1, orderIndex: 1 },
      { input: "abc\ncba\n", output: "YES\n", isPublic: false, weight: 1, orderIndex: 2 },
      { input: "code\ncode\n", output: "NO\n", isPublic: false, weight: 1, orderIndex: 3 },
      { input: "a\na\n", output: "YES\n", isPublic: false, weight: 1, orderIndex: 4 },
      { input: "ab\nba\n", output: "YES\n", isPublic: false, weight: 1, orderIndex: 5 },
      { input: "ab\nab\n", output: "NO\n", isPublic: false, weight: 1, orderIndex: 6 },
      { input: "hello\nolleh\n", output: "YES\n", isPublic: false, weight: 2, orderIndex: 7 },
      { input: "heLlo\nolleh\n", output: "NO\n", isPublic: false, weight: 2, orderIndex: 8 },
      { input: "verylongword\ndrowgnolyrev\n", output: "YES\n", isPublic: false, weight: 2, orderIndex: 9 }
    ]
  },
  {
    slug: 'cf-59a-word',
    title: 'Chuẩn hóa chữ hoa/thường',
    difficulty: 'Dễ',
    rating: 800,
    source: 'Codeforces 59A - Word',
    description: `Vasya muốn chuẩn hóa một từ sao cho toàn bộ ký tự đều là chữ thường hoặc toàn bộ là chữ hoa. Nếu số chữ hoa nhiều hơn số chữ thường thì đổi cả từ sang chữ hoa, ngược lại đổi sang chữ thường. Nếu hai bên bằng nhau thì cũng đổi sang chữ thường.

### Định dạng dữ liệu đầu vào:
* Một từ chỉ gồm chữ cái Latin hoa và thường.

### Định dạng dữ liệu đầu ra:
* In ra từ sau khi đã chuẩn hóa.`,
    examples: [
      { input: 'HoUse\n', output: 'house\n', explanation: 'Số chữ thường nhiều hơn nên đổi sang chữ thường.' },
      { input: 'ViP\n', output: 'VIP\n', explanation: 'Số chữ hoa nhiều hơn nên đổi sang chữ hoa.' }
    ],
    starterCode: `# Nhập từ s
s = input()

# Hãy chuẩn hóa và in kết quả
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 8,
    testcases: [
      { input: 'HoUse\n', output: 'house\n', isPublic: true, weight: 1, orderIndex: 0 },
      { input: 'ViP\n', output: 'VIP\n', isPublic: true, weight: 1, orderIndex: 1 },
      { input: 'maTRIx\n', output: 'matrix\n', isPublic: false, weight: 1, orderIndex: 2 },
      { input: 'abCD\n', output: 'abcd\n', isPublic: false, weight: 1, orderIndex: 3 },
      { input: 'A\n', output: 'A\n', isPublic: false, weight: 1, orderIndex: 4 },
      { input: 'a\n', output: 'a\n', isPublic: false, weight: 1, orderIndex: 5 },
      { input: 'HELLo\n', output: 'HELLO\n', isPublic: false, weight: 2, orderIndex: 6 },
      { input: 'hellO\n', output: 'hello\n', isPublic: false, weight: 2, orderIndex: 7 },
      { input: 'CODE\n', output: 'CODE\n', isPublic: false, weight: 1, orderIndex: 8 },
      { input: 'code\n', output: 'code\n', isPublic: false, weight: 1, orderIndex: 9 }
    ]
  },
  {
    slug: 'cf-6a-triangle',
    title: 'Tam giác, đoạn thẳng hay bất khả thi',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    source: 'Codeforces 6A - Triangle',
    description: `Cho bốn thanh gỗ có độ dài khác nhau. Hãy chọn đúng ba thanh để xem có thể tạo thành:
* TRIANGLE nếu tạo được tam giác không suy biến.
* SEGMENT nếu không tạo được tam giác không suy biến nhưng tạo được tam giác suy biến.
* IMPOSSIBLE nếu không thể tạo thành bất kỳ tam giác nào.

### Định dạng dữ liệu đầu vào:
* Một dòng gồm bốn số nguyên dương.

### Định dạng dữ liệu đầu ra:
* In TRIANGLE, SEGMENT hoặc IMPOSSIBLE.`,
    examples: [
      { input: '4 2 1 3\n', output: 'TRIANGLE\n', explanation: 'Chọn 4, 2 và 3 thì có thể tạo tam giác.' },
      { input: '7 2 2 4\n', output: 'SEGMENT\n', explanation: 'Không tạo được tam giác không suy biến nhưng tạo được tam giác suy biến (2, 2, 4).' }
    ],
    starterCode: `# Nhập 4 số nguyên
sides = list(map(int, input().split()))

# Hãy kiểm tra và in kết quả
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 9,
    testcases: [
      { input: '4 2 1 3\n', output: 'TRIANGLE\n', isPublic: true, weight: 1, orderIndex: 0 },
      { input: '7 2 2 4\n', output: 'SEGMENT\n', isPublic: true, weight: 1, orderIndex: 1 },
      { input: '3 5 9 1\n', output: 'IMPOSSIBLE\n', isPublic: false, weight: 1, orderIndex: 2 },
      { input: '5 5 5 8\n', output: 'TRIANGLE\n', isPublic: false, weight: 1, orderIndex: 3 },
      { input: '2 2 2 2\n', output: 'TRIANGLE\n', isPublic: false, weight: 1, orderIndex: 4 },
      { input: '1 2 3 4\n', output: 'TRIANGLE\n', isPublic: false, weight: 2, orderIndex: 5 },
      { input: '1 2 4 8\n', output: 'IMPOSSIBLE\n', isPublic: false, weight: 2, orderIndex: 6 },
      { input: '3 4 5 10\n', output: 'TRIANGLE\n', isPublic: false, weight: 2, orderIndex: 7 },
      { input: '10 20 30 40\n', output: 'TRIANGLE\n', isPublic: false, weight: 2, orderIndex: 8 },
      { input: '10 20 30 50\n', output: 'SEGMENT\n', isPublic: false, weight: 2, orderIndex: 9 }
    ]
  },
  {
    slug: 'cf-26a-almost-prime',
    title: 'Đếm số gần nguyên tố',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    source: 'Codeforces 26A - Almost Prime',
    description: `Một số được gọi là gần nguyên tố nếu nó có đúng hai ước nguyên tố phân biệt. Ví dụ 6, 18 và 24 là gần nguyên tố, còn 4, 8, 9, 42 thì không.

Hãy đếm xem có bao nhiêu số gần nguyên tố trong đoạn từ 1 đến n, kể cả hai đầu mút.

### Định dạng dữ liệu đầu vào:
* Một số nguyên n, 1 <= n <= 3000.

### Định dạng dữ liệu đầu ra:
* In ra số lượng số gần nguyên tố từ 1 đến n.`,
    examples: [
      { input: '10\n', output: '2\n', explanation: 'Các số gần nguyên tố không vượt quá 10 là 6 và 10.' },
      { input: '21\n', output: '8\n', explanation: 'Có 8 số gần nguyên tố từ 1 đến 21.' }
    ],
    starterCode: `# Nhập n
n = int(input())

# Hãy tính và in ra số lượng số gần nguyên tố
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 10,
    testcases: [
      { input: '10\n', output: '2\n', isPublic: true, weight: 1, orderIndex: 0 },
      { input: '21\n', output: '8\n', isPublic: true, weight: 1, orderIndex: 1 },
      { input: '1\n', output: '0\n', isPublic: false, weight: 1, orderIndex: 2 },
      { input: '5\n', output: '0\n', isPublic: false, weight: 1, orderIndex: 3 },
      { input: '6\n', output: '1\n', isPublic: false, weight: 1, orderIndex: 4 },
      { input: '30\n', output: '12\n', isPublic: false, weight: 2, orderIndex: 5 },
      { input: '100\n', output: '56\n', isPublic: false, weight: 2, orderIndex: 6 },
      { input: '500\n', output: '266\n', isPublic: false, weight: 2, orderIndex: 7 },
      { input: '3000\n', output: '1375\n', isPublic: false, weight: 2, orderIndex: 8 }
    ]
  },
  {
    slug: 'cf-96a-football',
    title: 'Tình huống bóng đá nguy hiểm',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    source: 'Codeforces 96A - Football',
    description: `Petya biểu diễn trạng thái trận bóng bằng một chuỗi chỉ gồm 0 và 1. Nếu tồn tại ít nhất 7 ký tự giống nhau đứng liên tiếp thì trạng thái đó được coi là nguy hiểm.

Hãy xác định xem trạng thái hiện tại có nguy hiểm hay không.

### Định dạng dữ liệu đầu vào:
* Một chuỗi không rỗng chỉ gồm ký tự 0 và 1.

### Định dạng dữ liệu đầu ra:
* In YES nếu trạng thái nguy hiểm, ngược lại in NO.`,
    examples: [
      { input: '001001\n', output: 'NO\n', explanation: 'Không có đoạn nào dài tới 7 ký tự giống nhau.' },
      { input: '1000000001\n', output: 'YES\n', explanation: 'Tồn tại 8 ký tự 0 liên tiếp đứng giữa.' }
    ],
    starterCode: `# Nhập chuỗi
s = input()

# Hãy kiểm tra và in kết quả
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 11,
    testcases: [
      { input: '001001\n', output: 'NO\n', isPublic: true, weight: 1, orderIndex: 0 },
      { input: '1000000001\n', output: 'YES\n', isPublic: true, weight: 1, orderIndex: 1 },
      { input: '1111111\n', output: 'YES\n', isPublic: false, weight: 1, orderIndex: 2 },
      { input: '0101010\n', output: 'NO\n', isPublic: false, weight: 1, orderIndex: 3 },
      { input: '0000000\n', output: 'YES\n', isPublic: false, weight: 1, orderIndex: 4 },
      { input: '000000111111\n', output: 'NO\n', isPublic: false, weight: 2, orderIndex: 5 },
      { input: '0000001111111\n', output: 'YES\n', isPublic: false, weight: 2, orderIndex: 6 },
      { input: '10101010101010\n', output: 'NO\n', isPublic: false, weight: 2, orderIndex: 7 },
      { input: '1111110000000\n', output: 'YES\n', isPublic: false, weight: 2, orderIndex: 8 },
      { input: '1111110111111\n', output: 'NO\n', isPublic: false, weight: 1, orderIndex: 9 }
    ]
  },
  {
    slug: 'cf-11a-increasing-sequence',
    title: 'Làm dãy tăng dần',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    source: 'Codeforces 11A - Increasing Sequence',
    description: `Cho một dãy b gồm n phần tử và một số dương d. Trong mỗi bước, bạn được chọn một phần tử bất kỳ và cộng thêm d vào nó. Hãy tìm số bước ít nhất để biến dãy thành dãy tăng nghiêm ngặt.

### Định dạng dữ liệu đầu vào:
* Dòng 1 chứa n và d.
* Dòng 2 chứa dãy b gồm n số nguyên.

### Định dạng dữ liệu đầu ra:
* In ra số bước nhỏ nhất cần thực hiện.`,
    examples: [
      { input: "4 2\n1 3 3 2\n", output: "3\n", explanation: 'Có thể tăng phần tử thứ 3 và thứ 4 để thu được dãy tăng.' },
      { input: "2 1\n4 1\n", output: "4\n", explanation: 'Tăng phần tử thứ hai 4 lần (1 -> 5).' }
    ],
    starterCode: `# Nhập dữ liệu
`,
    compareMode: 'token',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 12,
    testcases: [
      { input: "4 2\n1 3 3 2\n", output: "3\n", isPublic: true, weight: 1, orderIndex: 0 },
      { input: "2 1\n4 1\n", output: "4\n", isPublic: true, weight: 1, orderIndex: 1 },
      { input: "3 5\n10 10 10\n", output: "3\n", isPublic: false, weight: 1, orderIndex: 2 },
      { input: "4 10\n1 2 3 4\n", output: "0\n", isPublic: false, weight: 1, orderIndex: 3 },
      { input: "5 3\n1 1 1 1 1\n", output: "10\n", isPublic: false, weight: 2, orderIndex: 4 },
      { input: "3 100\n1000 500 100\n", output: "17\n", isPublic: false, weight: 2, orderIndex: 5 },
      { input: "5 7\n100 90 80 70 60\n", output: "20\n", isPublic: false, weight: 2, orderIndex: 6 },
      { input: "2 10\n10 10\n", output: "1\n", isPublic: false, weight: 1, orderIndex: 7 },
      { input: "6 5\n1 5 10 15 20 25\n", output: "0\n", isPublic: false, weight: 1, orderIndex: 8 }
    ]
  },
  {
    slug: 'bai-20-giai-phuong-trinh-bac-hai',
    title: 'Bài 20: Giải phương trình bậc hai',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    source: 'SimpleOJ - Toán lớp 8/9',
    description: `Viết chương trình giải phương trình bậc hai:

$$ax^2 + bx + c = 0$$

Trong bài này, luôn có:

$$a \\ne 0$$

### Dữ liệu vào
Gồm 3 dòng:
* Dòng 1 chứa số thực $a$.
* Dòng 2 chứa số thực $b$.
* Dòng 3 chứa số thực $c$.

### Dữ liệu ra
Chương trình cần in kết quả theo quy tắc sau:
* Nếu phương trình có 2 nghiệm phân biệt, in:
  * Dòng 1: số \`2\`
  * Dòng 2: hai nghiệm \`x1 x2\`
* Nếu phương trình có 1 nghiệm kép, in:
  * Dòng 1: số \`1\`
  * Dòng 2: nghiệm duy nhất
* Nếu phương trình vô nghiệm trong tập số thực, in:
  * Một dòng duy nhất chứa số \`0\`

Với trường hợp có 2 nghiệm phân biệt:
* \`x1\` là nghiệm tính theo nhánh dấu cộng: $x_1 = \\frac{-b + \\sqrt{\\Delta}}{2a}$
* \`x2\` là nghiệm tính theo nhánh dấu trừ: $x_2 = \\frac{-b - \\sqrt{\\Delta}}{2a}$

Kết quả số thực được chấp nhận nếu sai số không quá \`1e-6\`.

### Lưu ý quan trọng
Khi nộp bài trên hệ thống, học sinh chỉ in đúng kết quả yêu cầu.
Không in các dòng gợi ý nhập như: \`nhập a:\`, \`nhập b:\`, \`nhập c:\`, \`x1=\`, \`x2=\`...`,
    examples: [
      { input: "3\n5\n2\n", output: "2\n-0.6666666667 -1\n", explanation: 'Phương trình có 2 nghiệm phân biệt.' },
      { input: "1\n-2\n1\n", output: "1\n1\n", explanation: 'Phương trình có nghiệm kép.' },
      { input: "1\n0\n1\n", output: "0\n", explanation: 'Delta âm nên phương trình vô nghiệm thực.' }
    ],
    starterCode: '',
    compareMode: 'number',
    numberTolerance: 1e-6,
    isActive: true,
    orderIndex: 20,
    testcases: [
      { input: "3\n5\n2\n", output: "2\n-0.6666666667 -1\n", isPublic: true, weight: 1, orderIndex: 0, explanation: 'Phương trình có 2 nghiệm phân biệt.' },
      { input: "1\n-2\n1\n", output: "1\n1\n", isPublic: true, weight: 1, orderIndex: 1, explanation: 'Phương trình có nghiệm kép.' },
      { input: "1\n0\n1\n", output: "0\n", isPublic: true, weight: 1, orderIndex: 2, explanation: 'Delta âm nên phương trình vô nghiệm thực.' },
      { input: "1\n-3\n2\n", output: "2\n2 1\n", isPublic: false, weight: 2, orderIndex: 3, explanation: '' },
      { input: "1\n0\n-4\n", output: "2\n2 -2\n", isPublic: false, weight: 2, orderIndex: 4, explanation: '' },
      { input: "-1\n0\n4\n", output: "2\n-2 2\n", isPublic: false, weight: 2, orderIndex: 5, explanation: '' },
      { input: "1\n2\n5\n", output: "0\n", isPublic: false, weight: 2, orderIndex: 6, explanation: '' },
      { input: "2\n-7\n3\n", output: "2\n3 0.5\n", isPublic: false, weight: 3, orderIndex: 7, explanation: '' },
      { input: "5\n6\n1\n", output: "2\n-0.2 -1\n", isPublic: false, weight: 3, orderIndex: 8, explanation: '' },
      { input: "1\n1\n0\n", output: "2\n0 -1\n", isPublic: false, weight: 2, orderIndex: 9, explanation: '' },
      { input: "1\n-1\n-1\n", output: "2\n1.61803398875 -0.61803398875\n", isPublic: false, weight: 4, orderIndex: 10, explanation: '' },
      { input: "4\n4\n1\n", output: "1\n-0.5\n", isPublic: false, weight: 3, orderIndex: 11, explanation: '' },
      { input: "100\n0\n-1\n", output: "2\n0.1 -0.1\n", isPublic: false, weight: 3, orderIndex: 12, explanation: '' },
      { input: "1000\n-3000\n2000\n", output: "2\n2 1\n", isPublic: false, weight: 3, orderIndex: 13, explanation: '' }
    ]
  }
];
