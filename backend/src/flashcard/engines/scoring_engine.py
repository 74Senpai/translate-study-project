import re
from typing import List, Set, Optional
from loguru import logger


class ScoringEngine:
    """
    Hiện thực các nguyên tắc tính điểm và phân cấp bài tập theo spec:
    - Đúng: tăng tối đa 10, giảm dần theo thời gian cần thiết để trả lời, thấp nhất là 1.
    - Sai: giảm từ 1 đến 10 dựa vào: số lần gặp, số lần dịch (giảm ít hơn) và độ dài từ (giảm nhiều hơn).
    - Phân cấp bài tập dựa trên điểm thông thạo (-100 đến 100+).
    """

    @staticmethod
    def calculate_correct_score(time_spent: float, time_limit: float = 15.0) -> int:
        """
        Với mỗi câu trả lời đúng:
        Độ thông thạo tăng tối đa cho từ đó là 10, giảm dần theo thời gian cần thiết để trả lời, thấp nhất là 1.
        """
        if time_limit <= 0:
            time_limit = 15.0
        
        # Tỉ lệ thời gian sử dụng (0.0: trả lời tức thì, 1.0: hết thời gian)
        ratio = max(0.0, min(1.0, time_spent / time_limit))
        
        # Nếu trả lời cực nhanh (dưới 15% thời gian) -> 10 điểm
        # Càng mất thời gian điểm càng tiệm cận 1
        score = round(10.0 - (ratio * 9.0))
        return max(1, min(10, score))

    @staticmethod
    def calculate_incorrect_penalty(
        encountered_count: int = 0,
        translated_count: int = 0,
        word: str = ""
    ) -> float:
        """
        Nếu trả lời sai:
        Giảm độ thông thạo đi theo hệ số thấp nhất là 1 tối đa là 10.
        Tính theo:
        - Số lần gặp (encountered_count): gặp càng nhiều giảm càng ít
        - Số lần dịch (translated_count): dịch càng nhiều giảm càng ít
        - Độ dài chữ tiếng Anh (word length): chữ càng nhiều (dài) giảm càng nhiều
        3 chỉ số tổng lại tính được số điểm phải trừ (1..10).
        """
        clean_word = word.strip()
        word_len = len(clean_word)

        # 1. Độ dài chữ: từ ngắn (<=3 ký tự) penalty thấp hơn, từ dài (>=10 ký tự) penalty cao hơn
        # Điểm phạt từ độ dài: 0.1 đến 1.0
        length_penalty_factor = min(1.0, max(0.1, word_len / 10.0))

        # 2. Độ quen thuộc (gặp & dịch): gặp/dịch càng nhiều thì độ trừ giảm
        # familiarity_protection: 0.0 (rất quen) -> 1.0 (chưa gặp bao giờ)
        total_interactions = encountered_count + (translated_count * 2)
        familiarity_protection = 1.0 / (1.0 + 0.15 * total_interactions)

        # Trọng số: 45% từ độ dài, 55% từ mức độ tiếp xúc
        combined_ratio = (0.45 * length_penalty_factor) + (0.55 * familiarity_protection)
        combined_ratio = max(0.0, min(1.0, combined_ratio))

        # Quy đổi ra điểm phạt từ 1.0 đến 10.0
        penalty = 1.0 + (combined_ratio * 9.0)
        return round(max(1.0, min(10.0, penalty)), 1)

    @staticmethod
    def get_allowed_task_types_by_proficiency(proficiency: float) -> List[str]:
        """
        Quy tắc phân cấp bài tập theo điểm thông thạo từ mục 4 specification:
        - Dưới 0: chỉ cho phương thức chọn đáp án đúng (choice)
        - Trên 0: Chọn đáp án đúng, nghe Tiếng Anh và chọn tiếng Anh (choice, listen_choice)
        - Trên 20: Nghe tiếng Anh và chọn nghĩa tiếng Việt (listen_choice_vi), hoàn thành từ còn thiếu (complete)
        - Trên 30: Nghe và viết từ tiếng Anh (listen_write), viết tiếng Anh theo nghĩa (fill)
        - Trên 40: Nghe và viết nghĩa tiếng Việt (listen_write_vi), chọn định nghĩa tiếng Anh của từ trong câu (context_def_en)
        - Trên 50: Cho định nghĩa, chọn từ tiếng Anh (def_choice)
        - Trên 60: Cho định nghĩa, viết từ tiếng Anh (def_write)
        - Trên 70: Cho từ tiếng Anh trong câu, viết định nghĩa tiếng Việt (context_def_vi)
        - Trên 80: Cho từ tiếng Anh trong câu, viết định nghĩa tiếng Anh (context_def_en_write)
        """
        if proficiency < 0:
            return ["choice"]
        
        tasks = ["choice", "listen_choice"]

        if proficiency >= 20:
            tasks.extend(["listen_choice_vi", "complete"])
        
        if proficiency >= 30:
            tasks.extend(["listen_write", "fill"])

        if proficiency >= 40:
            tasks.extend(["listen_write_vi", "context_def_en"])

        if proficiency >= 50:
            tasks.append("def_choice")

        if proficiency >= 60:
            tasks.append("def_write")

        if proficiency >= 70:
            tasks.append("context_def_vi")

        if proficiency >= 80:
            tasks.append("context_def_en_write")

        return tasks

    @staticmethod
    def select_appropriate_task_type(
        proficiency: float,
        allowed_task_types: List[str]
    ) -> str:
        """
        Chọn dạng bài phù hợp nhất giữa cấu hình của bộ thẻ và ngưỡng thông thạo thực tế của người dùng.
        """
        proficiency_allowed = ScoringEngine.get_allowed_task_types_by_proficiency(proficiency)
        
        # Tìm các dạng giao nhau
        intersect = [t for t in allowed_task_types if t in proficiency_allowed]
        
        if intersect:
            # Chọn dạng thử thách cao nhất có trong giao thoa
            return intersect[-1]
        
        # Nếu không có giao thoa, fallback về choice (luôn an toàn)
        return "choice"

    @staticmethod
    def extract_english_words(text: str) -> List[str]:
        """
        Trích xuất các từ tiếng Anh thuần túy từ văn bản câu hỏi, câu trả lời.
        Dùng để ghi nhận từ vựng vào hệ thống & tăng match_count theo spec mục 4.
        """
        if not text:
            return []
        tokens = re.findall(r"\b[A-Za-z]+(?:'[A-Za-z]+)?\b", text)
        clean_words = []
        for t in tokens:
            w = t.strip().lower()
            if len(w) > 1 and not w.isnumeric():
                clean_words.append(w)
        return list(set(clean_words))
