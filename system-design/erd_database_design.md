# Thiết Kế Cơ Sở Dữ Liệu Supabase (Database ERD & Architecture)

## 1. Sơ đồ Quan hệ Thực thể (Mermaid ERD)

```mermaid
erDiagram
    USERS ||--o{ USER_WORDS : "sở hữu (1:N)"
    USERS ||--|| USER_STATISTICS : "thống kê tổng thể (1:1)"
    USERS ||--o{ USER_WORD_STATISTICS : "thống kê gặp/dịch từ (1:N)"
    USERS ||--o{ FLASHCARD_STATISTICS : "sở hữu kết quả ôn tập (1:N)"
    
    USER_WORDS ||--o{ WORD_MEANINGS : "có các nghĩa theo ngữ cảnh (1:N)"
    
    SENSES ||--o{ WORD_MEANINGS : "bổ trợ tra cứu/cache (1:N)"
    
    WORD_MEANINGS ||--|| FLASHCARD_STATISTICS : "tạo và liên kết flashcard (1:1)"

    USERS {
        uuid id PK "Khóa chính (Supabase auth.users.id)"
        varchar username UK "Tên đăng nhập / preferred_username từ Provider"
        varchar user_name "Alias đồng bộ với username"
        text name "Họ và tên từ Provider"
        varchar display_name "Tên hiển thị"
        varchar email "Email người dùng từ Provider"
        text avatar_url "URL ảnh đại diện Google/OAuth"
        text password "Nullable (Login qua Provider, không dùng password)"
        text hash_password "Nullable"
        timestamptz created_at "Thời điểm tạo"
        timestamptz updated_at "Thời điểm cập nhật"
    }

    USER_WORDS {
        uuid id PK "Khóa chính"
        uuid user_id FK "Khóa ngoại tới users(id)"
        varchar text "Từ hoặc cụm từ gốc (Unique per user)"
        int translate_count "Số lần dịch từ này"
        int review_count "Số lần ôn tập từ này"
        timestamptz last_translate "Lần dịch gần nhất"
        timestamptz last_review "Lần ôn tập gần nhất"
        int repetition_loop "Vòng lặp ngắt quãng tổng quát"
        timestamptz next_repetition "Lần lặp ngắt quãng tiếp theo"
        varchar status "Trạng thái (learning, mastered...)"
        int wrong_count "Số lần làm sai cấp độ từ"
        timestamptz created_at "Thời điểm tạo"
        timestamptz updated_at "Thời điểm cập nhật"
    }

    WORD_MEANINGS {
        uuid id PK "Khóa chính"
        uuid user_word_id FK "Khóa ngoại tới user_words(id)"
        varchar sense_id FK "Khóa ngoại tới senses(id)"
        text meaning "Nghĩa cụ thể trong ngữ cảnh"
        text context "Câu ngữ cảnh xuất hiện từ"
        text define "Định nghĩa"
        text example "Ví dụ mẫu"
        varchar pos "Từ loại (POS: noun, verb...)"
        varchar ipa "Phiên âm quốc tế (IPA)"
        text[] synonyms "Danh sách từ đồng nghĩa"
        text[] antonyms "Danh sách từ trái nghĩa"
        timestamptz created_at "Thời điểm tạo"
        timestamptz updated_at "Thời điểm cập nhật"
    }

    FLASHCARD_STATISTICS {
        uuid id PK "Khóa chính"
        uuid word_meaning_id FK,UK "Khóa ngoại 1:1 tới word_meanings(id)"
        uuid user_id FK "Khóa ngoại tới users(id)"
        numeric hard_score "Hệ số độ khó SRS (Ease factor: 1.30 - 2.50+)"
        int repe_loop "Chu kỳ lặp lại SRS"
        timestamptz next_review "Thời điểm ôn tập tiếp theo"
        timestamptz last_review "Thời điểm ôn tập gần nhất"
        int success_count "Tổng số lần trả lời đúng"
        int review_count "Tổng số lượt ôn tập"
        int chose_fail_count "Số lần chọn trắc nghiệm sai"
        int chose_true_count "Số lần chọn trắc nghiệm đúng"
        int fill_fail_count "Số lần điền từ sai"
        int fill_true_count "Số lần điền từ đúng"
        int write_fail_count "Số lần gõ/viết sai"
        int write_true_count "Số lần gõ/viết đúng"
        timestamptz created_at "Thời điểm tạo"
        timestamptz updated_at "Thời điểm cập nhật"
    }

    SENSES {
        varchar id PK "Mã sense (vd: ctx_wn_bank.n.01)"
        text meaning "Nghĩa tiếng Việt chuẩn"
        int match_count "Số lần khớp sense này"
        numeric confidence "Độ tin cậy WSD (0.0 - 1.0)"
        boolean trusted "Đã được tin cậy/xác thực"
        numeric rate "Đánh giá chất lượng (0 - 5.0)"
        text define "Định nghĩa nguyên bản"
        text example "Ví dụ mẫu"
        varchar pos "Từ loại"
        varchar ipa "Phiên âm IPA"
        text[] synonyms "Từ đồng nghĩa"
        text[] antonyms "Từ trái nghĩa"
        timestamptz created_at "Thời điểm tạo"
        timestamptz updated_at "Thời điểm cập nhật"
    }

    USER_WORD_STATISTICS {
        uuid id PK "Khóa chính"
        uuid user_id FK "Khóa ngoại tới users(id)"
        varchar word "Từ vựng (Unique per user)"
        int encountered_count "Số lần gặp từ trong văn bản"
        int translated_count "Số lần dịch từ"
        int total_count "Tổng số lần gặp và dịch"
        timestamptz last_seen "Lần cuối tương tác"
        jsonb source_counts "Phân bổ nguồn (web, extension...)"
        timestamptz created_at "Thời điểm tạo"
        timestamptz updated_at "Thời điểm cập nhật"
    }

    USER_STATISTICS {
        uuid id PK "Khóa chính"
        uuid user_id FK,UK "Khóa ngoại 1:1 tới users(id)"
        int total_words_saved "Tổng số từ đã lưu"
        int total_translations "Tổng số lần dịch"
        int total_words_encountered "Tổng số lượt gặp từ"
        int total_reviews "Tổng lượt làm bài ôn tập"
        int total_mastered_words "Số từ đã thành thạo"
        int streak_days "Chuỗi ngày học liên tục"
        timestamptz last_active_at "Lần hoạt động gần nhất"
        timestamptz created_at "Thời điểm tạo"
        timestamptz updated_at "Thời điểm cập nhật"
    }
```

---

## 2. Các điểm kỹ thuật nổi bật

1. **Quan hệ phân cấp từ vựng & ngữ cảnh:**
   - Mỗi người dùng (`users`) sở hữu danh sách các từ vựng duy nhất (`user_words` với constraint `UNIQUE(user_id, text)`).
   - Mỗi từ có thể mang nhiều tầng nghĩa khác nhau trong các bài đọc/ngữ cảnh khác nhau (`word_meanings`).
   - Mỗi tầng nghĩa sinh ra một thực thể flashcard riêng biệt (`flashcard_statistics` với quan hệ 1:1), tự động được khởi tạo thông qua **Database Trigger** `trg_auto_create_flashcard_stat`.

2. **Cơ chế tái sử dụng tri thức (Sense Cache):**
   - Bảng `senses` đóng vai trò là Global Knowledge Base / Shared Cache cho mô hình WSD (Word Sense Disambiguation).
   - Khi bất kỳ người dùng nào dịch một từ và hệ thống nhận diện được `sense_id`, hàm `upsert_sense_cache()` sẽ lưu lại hoặc tăng `match_count`, cho phép tái sử dụng định nghĩa, ví dụ, từ đồng nghĩa và phiên âm cho toàn bộ hệ thống.

3. **Thống kê chuyên sâu phục vụ thuật toán Spaced Repetition (SRS):**
   - Bảng `flashcard_statistics` ghi nhận chi tiết tỉ lệ đúng/sai theo từng thể loại bài tập:
     - `chose_fail_count` / `chose_true_count` (Trắc nghiệm Multiple Choice)
     - `fill_fail_count` / `fill_true_count` (Điền từ vào chỗ trống Fill-in-the-blank)
     - `write_fail_count` / `write_true_count` (Gõ/chính tả Spelling & Dictation)
   - Lưu trữ hệ số độ khó `hard_score` (tương thích thuật toán SM-2) và vòng lặp `repe_loop` cùng thời gian ôn tập tiếp theo `next_review`.

4. **Thống kê hành vi đọc & dịch (`user_word_statistics`):**
   - Đáp ứng chính xác yêu cầu đếm số lần gặp từ (`encountered_count`) và số lần dịch từ (`translated_count`).
   - Hỗ trợ lưu trữ dạng JSONB `source_counts` để phân biệt lượt tra từ Extension hay Web.
