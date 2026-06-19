export const codeforcesViProblems = [
  {
    slug: 'cf-4a-watermelon',
    title: 'Bài 1: Chia dưa hấu',
    difficulty: 'Dễ',
    rating: 800,
    description: `Cho trọng lượng w của một quả dưa hấu. Hãy kiểm tra xem có thể chia w thành hai phần nguyên dương, và cả hai phần đều có cân nặng chẵn hay không.

### Định dạng dữ liệu đầu vào:
* Một số nguyên w, 1 <= w <= 100.

### Định dạng dữ liệu đầu ra:
* In YES nếu chia được, ngược lại in NO.`,
    examples: [
      {
        input: '8',
        output: 'YES',
        explanation: 'Có thể chia thành 2 và 6.'
      }
    ],
    testcases: [
      { input: '8', output: 'YES' },
      { input: '2', output: 'NO' },
      { input: '3', output: 'NO' },
      { input: '100', output: 'YES' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 4A - Watermelon',
    orderIndex: 1
  },
  {
    slug: 'cf-9a-die-roll',
    title: 'Bài 2: Xác suất của Dot',
    difficulty: 'Dễ',
    rating: 800,
    description: `Yakko và Wakko đã tung xúc xắc và nhận được lần lượt Y và W điểm. Dot sẽ thắng nếu số của cô ấy không nhỏ hơn cả hai người kia, vì nếu bằng điểm thì Dot vẫn được tính là thắng.

Hãy in xác suất Dot chiến thắng dưới dạng phân số tối giản A/B. Nếu xác suất bằng 0 hãy in 0/1, nếu bằng 1 hãy in 1/1.

### Định dạng dữ liệu đầu vào:
* Một dòng chứa hai số nguyên Y và W.

### Định dạng dữ liệu đầu ra:
* In ra phân số tối giản biểu diễn xác suất Dot thắng.`,
    examples: [
      {
        input: '4 2',
        output: '1/2',
        explanation: 'Dot thắng nếu tung được 4, 5 hoặc 6.'
      }
    ],
    testcases: [
      { input: '4 2', output: '1/2' },
      { input: '3 3', output: '2/3' },
      { input: '6 6', output: '1/6' },
      { input: '1 1', output: '1/1' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 9A - Die Roll',
    orderIndex: 2
  },
  {
    slug: 'cf-32b-borze',
    title: 'Bài 3: Giải mã Borze',
    difficulty: 'Dễ',
    rating: 800,
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
      {
        input: '.-.--',
        output: '012',
        explanation: 'Chuỗi được đọc lần lượt thành 0, 1, 2.'
      }
    ],
    testcases: [
      { input: '.-.--', output: '012' },
      { input: '--.', output: '20' },
      { input: '.', output: '0' },
      { input: '-..-.--', output: '1012' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 32B - Borze',
    orderIndex: 3
  },
  {
    slug: 'cf-38a-army',
    title: 'Bài 4: Quân hàm và số năm',
    difficulty: 'Dễ',
    rating: 800,
    description: `Hệ thống quân hàm của Berland có n bậc, đánh số từ 1 đến n. Để đi từ bậc i lên bậc i + 1 cần d_i năm. Vasya vừa đạt bậc a và muốn lên bậc b.

Hãy tính tổng số năm Vasya còn phải phục vụ.

### Định dạng dữ liệu đầu vào:
* Dòng 1 chứa n.
* Dòng 2 chứa n - 1 số nguyên d_i.
* Dòng 3 chứa hai số nguyên a và b.

### Định dạng dữ liệu đầu ra:
* In ra số năm cần thiết để đi từ a lên b.`,
    examples: [
      {
        input: '3\n5 6\n1 2',
        output: '5',
        explanation: 'Từ bậc 1 lên bậc 2 mất 5 năm.'
      }
    ],
    testcases: [
      { input: '3\n5 6\n1 3', output: '11' },
      { input: '4\n1 2 3\n2 4', output: '5' },
      { input: '5\n1 2 3 4\n1 5', output: '10' },
      { input: '2\n7\n1 2', output: '7' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 38A - Army',
    orderIndex: 4
  },
  {
    slug: 'cf-41a-translation',
    title: 'Bài 5: Dịch ngược một từ',
    difficulty: 'Dễ',
    rating: 800,
    description: `Trong ngôn ngữ Berland và Birland, một từ có nghĩa giống nhau nếu nó bị viết ngược lại. Ví dụ code tương ứng với edoc.

Hãy kiểm tra xem từ t có phải là từ s viết ngược hay không.

### Định dạng dữ liệu đầu vào:
* Dòng 1 chứa từ s.
* Dòng 2 chứa từ t.

### Định dạng dữ liệu đầu ra:
* In YES nếu t là s viết ngược, ngược lại in NO.`,
    examples: [
      {
        input: 'code\nedoc',
        output: 'YES',
        explanation: 'edoc là code viết ngược.'
      }
    ],
    testcases: [
      { input: 'code\nedoc', output: 'YES' },
      { input: 'abb\naba', output: 'NO' },
      { input: 'abc\ncba', output: 'YES' },
      { input: 'code\ncode', output: 'NO' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 41A - Translation',
    orderIndex: 5
  },
  {
    slug: 'cf-59a-word',
    title: 'Bài 6: Chuẩn hóa chữ hoa/thường',
    difficulty: 'Dễ',
    rating: 800,
    description: `Vasya muốn chuẩn hóa một từ sao cho toàn bộ ký tự đều là chữ thường hoặc toàn bộ là chữ hoa. Nếu số chữ hoa nhiều hơn số chữ thường thì đổi cả từ sang chữ hoa, ngược lại đổi sang chữ thường. Nếu hai bên bằng nhau thì cũng đổi sang chữ thường.

### Định dạng dữ liệu đầu vào:
* Một từ chỉ gồm chữ cái Latin hoa và thường.

### Định dạng dữ liệu đầu ra:
* In ra từ sau khi đã chuẩn hóa.`,
    examples: [
      {
        input: 'HoUse',
        output: 'house',
        explanation: 'Số chữ thường nhiều hơn nên đổi sang chữ thường.'
      }
    ],
    testcases: [
      { input: 'HoUse', output: 'house' },
      { input: 'ViP', output: 'VIP' },
      { input: 'maTRIx', output: 'matrix' },
      { input: 'abCD', output: 'abcd' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 59A - Word',
    orderIndex: 6
  },
  {
    slug: 'cf-6a-triangle',
    title: 'Bài 7: Tam giác, đoạn thẳng hay bất khả thi',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    description: `Cho bốn thanh gỗ có độ dài khác nhau. Hãy chọn đúng ba thanh để xem có thể tạo thành:
* TRIANGLE nếu tạo được tam giác không suy biến.
* SEGMENT nếu không tạo được tam giác không suy biến nhưng tạo được tam giác suy biến.
* IMPOSSIBLE nếu không thể tạo thành bất kỳ tam giác nào.

### Định dạng dữ liệu đầu vào:
* Một dòng gồm bốn số nguyên dương.

### Định dạng dữ liệu đầu ra:
* In TRIANGLE, SEGMENT hoặc IMPOSSIBLE.`,
    examples: [
      {
        input: '4 2 1 3',
        output: 'TRIANGLE',
        explanation: 'Chọn 4, 2 và 3 thì có thể tạo tam giác.'
      }
    ],
    testcases: [
      { input: '4 2 1 3', output: 'TRIANGLE' },
      { input: '7 2 2 4', output: 'SEGMENT' },
      { input: '3 5 9 1', output: 'IMPOSSIBLE' },
      { input: '5 5 5 8', output: 'TRIANGLE' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1500,
    isActive: true,
    source: 'Codeforces 6A - Triangle',
    orderIndex: 7
  },
  {
    slug: 'cf-26a-almost-prime',
    title: 'Bài 8: Đếm số gần nguyên tố',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    description: `Một số được gọi là gần nguyên tố nếu nó có đúng hai ước nguyên tố phân biệt. Ví dụ 6, 18 và 24 là gần nguyên tố, còn 4, 8, 9, 42 thì không.

Hãy đếm xem có bao nhiêu số gần nguyên tố trong đoạn từ 1 đến n, kể cả hai đầu mút.

### Định dạng dữ liệu đầu vào:
* Một số nguyên n, 1 <= n <= 3000.

### Định dạng dữ liệu đầu ra:
* In ra số lượng số gần nguyên tố từ 1 đến n.`,
    examples: [
      {
        input: '10',
        output: '2',
        explanation: 'Các số gần nguyên tố không vượt quá 10 là 6 và 10.'
      }
    ],
    testcases: [
      { input: '1', output: '0' },
      { input: '10', output: '2' },
      { input: '21', output: '8' },
      { input: '30', output: '12' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1500,
    isActive: true,
    source: 'Codeforces 26A - Almost Prime',
    orderIndex: 8
  },
  {
    slug: 'cf-96a-football',
    title: 'Bài 9: Tình huống bóng đá nguy hiểm',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    description: `Petya biểu diễn trạng thái trận bóng bằng một chuỗi chỉ gồm 0 và 1. Nếu tồn tại ít nhất 7 ký tự giống nhau đứng liên tiếp thì trạng thái đó được coi là nguy hiểm.

Hãy xác định xem trạng thái hiện tại có nguy hiểm hay không.

### Định dạng dữ liệu đầu vào:
* Một chuỗi không rỗng chỉ gồm ký tự 0 và 1.

### Định dạng dữ liệu đầu ra:
* In YES nếu trạng thái nguy hiểm, ngược lại in NO.`,
    examples: [
      {
        input: '001001',
        output: 'NO',
        explanation: 'Không có đoạn nào dài tới 7 ký tự giống nhau.'
      }
    ],
    testcases: [
      { input: '001001', output: 'NO' },
      { input: '1000000001', output: 'YES' },
      { input: '1111111', output: 'YES' },
      { input: '0101010', output: 'NO' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1500,
    isActive: true,
    source: 'Codeforces 96A - Football',
    orderIndex: 9
  },
  {
    slug: 'cf-11a-increasing-sequence',
    title: 'Bài 10: Làm dãy tăng dần',
    difficulty: 'Dễ - Trung bình',
    rating: 900,
    description: `Cho một dãy b gồm n phần tử và một số dương d. Trong mỗi bước, bạn được chọn một phần tử bất kỳ và cộng thêm d vào nó. Hãy tìm số bước ít nhất để biến dãy thành dãy tăng nghiêm ngặt.

### Định dạng dữ liệu đầu vào:
* Dòng 1 chứa n và d.
* Dòng 2 chứa dãy b gồm n số nguyên.

### Định dạng dữ liệu đầu ra:
* In ra số bước nhỏ nhất cần thực hiện.`,
    examples: [
      {
        input: '4 2\n1 3 3 2',
        output: '3',
        explanation: 'Có thể tăng phần tử thứ 3 và thứ 4 để thu được dãy tăng.'
      }
    ],
    testcases: [
      { input: '4 2\n1 3 3 2', output: '3' },
      { input: '2 1\n4 1', output: '4' },
      { input: '3 5\n10 10 10', output: '3' },
      { input: '4 10\n1 2 3 4', output: '0' }
    ],
    timeLimitMinutes: 30,
    executionLimitMs: 1000,
    isActive: true,
    source: 'Codeforces 11A - Increasing Sequence',
    orderIndex: 10
  }
];
