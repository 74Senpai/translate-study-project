1. Chức năng tạo flashcard

- Tạo Flashcard công khai (public): Tạo flashcard công khai, bất kỳ ai cũng có thể nhìn thấy và tham gia.
- Tạo Flashcard không công khai (private): Chỉ người tạo thấy được và người được mời, người có mã có thể tham gia.

2. Nội dung flashcard

- Nội dung được người dùng tự tạo, tự nhập. (manual)
- Nội dung được AI hỗ trợ tạo theo yêu cầu người dùng.(AI gen)
- Nội dung được tạo động (Dynamic) từ dữ liệu, kho từ đã lưu của người dùng mỗi lần người dùng sử dụng bộ flashcard. (User data dynamic gen)
- Nội dung được tạo động từ dữ liệu, kho từ đã lưu của hệ thống mỗi lần người dùng sử dụng (System data dynamic gen)

Lưu ý: Với các phương thức Dynamic, người dùng không tạo nội dung câu hỏi, chỉ cài đặt số lượng câu hỏi, ... setting cho bộ flashcard.

3. Cài đặt flashcard.

- Với mỗi flashcard đi kèm theo setting gồm:
  - Số lượng card mỗi lần
  - Các dạng card: Hoàn thành một từ theo nghĩa, Chọn nghĩa đúng, từ đúng, Viết 1 từ, Nghe và chọn, viết. Chọn các đáp án đúng.
  - Cấu hình thời gian: quy định tổng thời gian để hoàn thành tất cả câu hoặc quy định thời gian của mỗi câu riêng lẻ.
  - Số lần có thể làm mỗi ngày / người hoặc không.
  - Cấu hình thời gian mở, đóng của bộ thẻ hoặc không.

- Với bộ thẻ đặc biệt User data dynamic gen:
  - Cấu hình thuật toán space repetition cho hệ thống Leitner để tạo ra số lượng box, khoảng cách giữa các box. Box ở đây được xem là ngày có thể ôn tập.
  - Cấu hình ưu tiên ôn tập: Dịch nhiều nhất / ít nhất, gặp nhiều nhất / ít nhất, dịch + gặp nhiều nhất / ít nhất.
  - Cấu hình ngưỡng thông thạo bắt đầu ôn tập

4. Nguyên tắc hoạt động cơ bản của flashcard.

- Mỗi từ xuất hiện trong flashcard (Câu trả lời, câu hỏi) nếu là tiếng Anh, nó sẽ được ghi nhận và lưu như 1 từ tiếng Anh, nếu là từ đã có trong kho của user tăng match_count lên 1.
- Với mỗi câu trả lời, nếu trả lời đúng, độ thông thạo tăng lên tối đa cho từ đó là 10, giảm dần theo thời gian cần thiết để trả lời, thấp nhất là 1. nếu trả lời sai, giảm độ thông thạo đi theo hệ số thấp nhất là 1 tối đa là 10 tính theo số lần gặp, dịch và độ dài của chữ tiếng Anh, gặp càng nhiều, dịch càng nhiều giảm càng ít, chữ càng nhiều giảm càng nhiều, 3 chỉ số tổng lại sẽ tính được số % điểm phải trừ.
- Khi điểm thông thạo thấp (Dưới 0), chỉ cho phương thức chọn đáp án đúng.
- Trên 0: Chọn đáp án đúng, nghe Tiếng Anh và chọn tiếng Anh
- Trên 20: Nghe tiếng Anh và chọn nghĩa tiếng Việt, hoàn thành từ còn thiết: He_lo -> Hello, ...
- Trên 30: Nghe và viết từ tiếng anh, viết tiếng anh theo nghĩa.
- Trên 40L Nghe và viết nghĩa tiếng việt, chọn định nghĩa tiếng Anh của từ trong câu
- Trên 50: Cho định nghĩa, chọn từ tiếng anh
- trên 60L cho định nghĩa viết từ tiếng anh
- trên 70L cho từ tiếng Anh trong câu, viết định nghĩa tiếng việt
- trên 80L cho từ tiếng Anh trong câu, viết định nghĩa tiếng Anh
