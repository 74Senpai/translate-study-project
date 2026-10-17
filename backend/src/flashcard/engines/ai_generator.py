import json
import uuid
import random
from typing import List, Dict, Any, Optional
from loguru import logger
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field

from src.config import get_settings
from src.flashcard.models.flashcard_models import FlashcardCard, AIGenerateRequest
from src.flashcard.engines.dynamic_generator import DynamicGenerator


class AIGeneratedCardItem(BaseModel):
    word: str = Field(description="Từ hoặc cụm từ tiếng Anh")
    meaning: str = Field(description="Nghĩa tiếng Việt chuẩn xác")
    ipa: Optional[str] = Field(default="", description="Phiên âm IPA")
    example: Optional[str] = Field(default="", description="Câu ví dụ tiếng Anh có chứa từ")
    definition_en: Optional[str] = Field(default="", description="Định nghĩa ngắn gọn bằng tiếng Anh")
    definition_vi: Optional[str] = Field(default="", description="Định nghĩa bằng tiếng Việt")
    hint: Optional[str] = Field(default="", description="Gợi ý trả lời")
    distractors: List[str] = Field(default=[], description="3 phương án tiếng Việt sai cho bài trắc nghiệm")


class AIGeneratedCardList(BaseModel):
    cards: List[AIGeneratedCardItem]


class AIFlashcardGenerator:
    """
    Sinh thẻ flashcard tự động bằng Generative AI (Gemini) hoặc thông qua tri thức ngữ liệu.
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.gemini_api_key
        self.model = settings.gemini_model or "gemini-2.5-flash"
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.warning(f"Could not initialize Gemini Client for Flashcards: {e}")

    async def generate_cards(self, req: AIGenerateRequest) -> List[FlashcardCard]:
        """
        Sinh danh sách cards dựa trên prompt, số lượng, độ khó và các dạng task types.
        """
        count = min(30, max(1, req.count))
        task_types = req.task_types or ["choice", "fill", "complete"]
        diff = req.difficulty[0] if req.difficulty else "medium"

        if self.client:
            try:
                prompt_text = (
                    f"Create {count} vocabulary flashcards based on the theme/request: '{req.prompt}'.\n"
                    f"Difficulty: {diff}.\n"
                    f"Include high-utility English vocabulary, accurate Vietnamese meaning, IPA pronunciation, "
                    f"an illustrative example sentence in English, and 3 reasonable Vietnamese distractor meanings for multiple-choice."
                )

                config = genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=AIGeneratedCardList,
                    temperature=0.7,
                )

                resp = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt_text,
                    config=config,
                )

                if resp and resp.text:
                    parsed = json.loads(resp.text)
                    items = parsed.get("cards", [])
                    return self._convert_items_to_cards(items, task_types, diff, req.include_hint)
            except Exception as e:
                logger.error(f"Gemini flashcard generation failed: {e}. Falling back to lexical generation.")

        # Fallback generation khi không có API key hoặc gặp sự cố
        return self._generate_fallback_cards(req.prompt, count, task_types, diff, req.include_hint)

    def _convert_items_to_cards(
        self,
        items: List[Dict[str, Any]],
        task_types: List[str],
        difficulty: str,
        include_hint: bool
    ) -> List[FlashcardCard]:
        cards: List[FlashcardCard] = []
        for item in items:
            word = item.get("word", "").strip()
            meaning = item.get("meaning", "").strip()
            if not word or not meaning:
                continue

            distractors = item.get("distractors") or []
            tasks = DynamicGenerator._build_card_tasks(
                word=word,
                meaning=meaning,
                distractors=distractors,
                allowed_task_types=task_types,
                proficiency=0.0,
                ipa=item.get("ipa"),
                context=item.get("example"),
                definition_en=item.get("definition_en"),
                definition_vi=item.get("definition_vi"),
            )

            hint = item.get("hint") if include_hint else ""
            if not hint and include_hint:
                hint = item.get("definition_vi") or f"Bắt đầu bằng chữ '{word[0]}'"

            card = FlashcardCard(
                id=f"ai_{uuid.uuid4().hex[:8]}",
                word=word,
                meaning=meaning,
                ipa=item.get("ipa"),
                question=f"Chọn nghĩa hoặc hoàn thành từ '{word}'",
                hint=hint,
                context=item.get("example"),
                definition_en=item.get("definition_en"),
                definition_vi=item.get("definition_vi"),
                difficulty=difficulty,
                timer=15,
                points=10,
                tasks=tasks,
                user_proficiency=0.0,
                user_attempts=0,
                leitner_box=1,
            )
            cards.append(card)
        return cards

    def _generate_fallback_cards(
        self,
        topic: str,
        count: int,
        task_types: List[str],
        difficulty: str,
        include_hint: bool
    ) -> List[FlashcardCard]:
        """Tạo thẻ fallback có cấu trúc phong phú theo chủ đề."""
        fallback_pool = [
            {"word": "achieve", "meaning": "đạt được", "ipa": "/əˈtʃiːv/", "example": "She worked hard to achieve her goal.", "distractors": ["thất bại", "từ chối", "trì hoãn"]},
            {"word": "benefit", "meaning": "lợi ích", "ipa": "/ˈbenɪfɪt/", "example": "Regular exercise provides many health benefits.", "distractors": ["tổn hại", "nguy cơ", "khó khăn"]},
            {"word": "create", "meaning": "tạo ra", "ipa": "/kriˈeɪt/", "example": "The artist created a magnificent sculpture.", "distractors": ["phá hủy", "xóa bỏ", "hạn chế"]},
            {"word": "discover", "meaning": "khám phá", "ipa": "/dɪˈskʌvər/", "example": "Scientists discovered a new species.", "distractors": ["che giấu", "quên lãng", "bỏ qua"]},
            {"word": "expand", "meaning": "mở rộng", "ipa": "/ɪkˈspænd/", "example": "The company plans to expand internationally.", "distractors": ["thu hẹp", "đóng cửa", "ngăn chặn"]},
            {"word": "focus", "meaning": "tập trung", "ipa": "/ˈfoʊkəs/", "example": "You need to focus on your main objectives.", "distractors": ["phân tán", "lơ là", "bỏ dở"]},
            {"word": "generate", "meaning": "tạo ra, phát sinh", "ipa": "/ˈdʒenəreɪt/", "example": "Solar panels generate clean electricity.", "distractors": ["tiêu hao", "dập tắt", "tiêu diệt"]},
            {"word": "improve", "meaning": "cải thiện", "ipa": "/ɪmˈpruːv/", "example": "He practiced every day to improve his English.", "distractors": ["làm tệ đi", "đứng yên", "suy giảm"]},
            {"word": "maintain", "meaning": "duy trì", "ipa": "/meɪnˈteɪn/", "example": "It is important to maintain healthy habits.", "distractors": ["bỏ bê", "phá vỡ", "thay đổi"]},
            {"word": "resolve", "meaning": "giải quyết", "ipa": "/rɪˈzɑːlv/", "example": "They met to resolve their differences.", "distractors": ["gây tranh cãi", "phức tạp hóa", "trốn tránh"]},
        ]

        items = (fallback_pool * ((count // len(fallback_pool)) + 1))[:count]
        return self._convert_items_to_cards(items, task_types, difficulty, include_hint)
