import random
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from loguru import logger
from src.flashcard.models.flashcard_models import (
    FlashcardCard,
    LeitnerConfig,
    FlashcardSettings,
)


class DynamicGenerator:
    """
    Tạo nội dung câu hỏi và flashcard động mỗi khi bắt đầu phiên học:
    1. User data dynamic gen (từ kho từ, lịch sử học tập & cấu hình Leitner của user)
    2. System data dynamic gen (từ kho từ vựng toàn hệ thống)
    """

    @staticmethod
    def _create_complete_patterns(word: str) -> List[Dict[str, Any]]:
        """Tạo các dạng khuyết ký tự (vd: h_llo, he_lo)."""
        clean_word = word.strip()
        length = len(clean_word)
        if length <= 2:
            return [{"display_text": clean_word, "blanks": []}]

        patterns = []
        for _ in range(3):
            # Tạo số lượng chỗ trống từ 30% đến 50% độ dài
            blank_count = max(1, min(length - 1, int(length * random.uniform(0.3, 0.5))))
            indices = set(random.sample(range(length), blank_count))

            display = []
            blanks = []
            for idx, ch in enumerate(clean_word):
                if idx in indices:
                    display.append("_")
                    blanks.append(ch)
                else:
                    display.append(ch)

            patterns.append({
                "display_text": "".join(display),
                "blanks": blanks
            })
        return patterns

    @staticmethod
    def _select_task_type(
        proficiency: float,
        allowed_task_types: List[str],
        has_context: bool = False,
        has_definition_en: bool = False,
    ) -> str:
        """
        Chọn dạng bài phù hợp nhất dựa trên độ thông thạo theo spec mục 4:
        - Dưới 0  : chỉ choice
        - Trên 0  : choice, listen_choice
        - Trên 20 : + complete (hoàn thành từ còn thiếu)
        - Trên 30 : + fill (viết tiếng Anh theo nghĩa), listen_write
        - Trên 50 : + def_choice (cho định nghĩa, chọn từ)
        - Trên 60 : + def_write (cho định nghĩa, viết từ)
        - Trên 70 : + context_def_vi (từ trong câu, viết nghĩa VI)
        - Trên 80 : + context_def_en (từ trong câu, viết nghĩa EN)
        Chọn dạng thách thức nhất trong giao của proficiency_allowed và allowed_task_types.
        """
        proficiency_allowed: List[str] = ["choice"]

        if proficiency >= 0:
            proficiency_allowed.append("listen_choice")
        if proficiency >= 20:
            proficiency_allowed.append("complete")
        if proficiency >= 30:
            proficiency_allowed += ["fill", "listen_write"]
        if proficiency >= 50 and has_definition_en:
            proficiency_allowed.append("def_choice")
        if proficiency >= 60 and has_definition_en:
            proficiency_allowed.append("def_write")
        if proficiency >= 70 and has_context:
            proficiency_allowed.append("context_def_vi")
        if proficiency >= 80 and has_context:
            proficiency_allowed.append("context_def_en")

        # Giao với allowed_task_types của bộ thẻ — ưu tiên dạng thách thức nhất (cuối danh sách)
        candidates = [t for t in proficiency_allowed if t in allowed_task_types]
        if candidates:
            return candidates[-1]

        # Fallback theo thứ tự ưu tiên cơ bản
        for t in ["choice", "fill", "complete"]:
            if t in allowed_task_types:
                return t
        return "choice"

    @staticmethod
    def _build_question_text(
        task_type: str,
        word: str,
        meaning: str,
        context: Optional[str] = None,
        definition_en: Optional[str] = None,
        definition_vi: Optional[str] = None,
    ) -> str:
        """
        Sinh câu hỏi phù hợp với task_type đã chọn — KHÔNG tiết lộ đáp án:
        - choice      : hỏi nghĩa của từ (hiện từ, đáp án là nghĩa VI)
        - fill        : hỏi dịch sang tiếng Anh (hiện nghĩa VI, đáp án là từ tiếng Anh)
        - complete    : hỏi điền chữ còn thiếu (không hiện từ đầy đủ)
        - listen_choice: nghe từ → chọn nghĩa tiếng Việt
        - listen_write : nghe từ → viết từ tiếng Anh
        - def_choice  : cho định nghĩa → chọn từ tiếng Anh
        - def_write   : cho định nghĩa → viết từ tiếng Anh
        - context_def_vi: từ trong câu → viết định nghĩa tiếng Việt
        - context_def_en: từ trong câu → viết định nghĩa tiếng Anh
        """
        if task_type == "choice":
            if context and context.strip():
                return f'Trong câu ví dụ, từ "{word}" có nghĩa nào phù hợp nhất?'
            return f'Nghĩa của từ "{word}" là gì?'

        elif task_type == "fill":
            return f'Dịch sang tiếng Anh: "{meaning}"'

        elif task_type == "complete":
            return "Điền các chữ cái còn thiếu để hoàn thành từ"

        elif task_type == "listen_choice":
            return "Nghe từ tiếng Anh và chọn nghĩa tiếng Việt đúng"

        elif task_type == "listen_write":
            return "Nghe từ tiếng Anh và viết lại từ đó"

        elif task_type == "def_choice":
            def_text = definition_en or definition_vi or ""
            if def_text:
                return f'Định nghĩa: "{def_text}" — Từ tiếng Anh nào phù hợp?'
            return "Chọn từ tiếng Anh phù hợp với định nghĩa trên"

        elif task_type == "def_write":
            def_text = definition_en or definition_vi or ""
            if def_text:
                return f'Định nghĩa: "{def_text}" — Viết từ tiếng Anh tương ứng'
            return "Viết từ tiếng Anh phù hợp với định nghĩa trên"

        elif task_type == "context_def_vi":
            ctx = context or ""
            if ctx:
                return f'Câu: "{ctx}" — Viết định nghĩa tiếng Việt của từ "{word}"'
            return f'Viết định nghĩa tiếng Việt của từ "{word}"'

        elif task_type == "context_def_en":
            ctx = context or ""
            if ctx:
                return f'Câu: "{ctx}" — Viết định nghĩa tiếng Anh của từ "{word}"'
            return f'Viết định nghĩa tiếng Anh của từ "{word}"'

        return f'Nghĩa của từ "{word}" là gì?'

    @staticmethod
    def _build_card_tasks(
        word: str,
        meaning: str,
        distractors: List[str],
        allowed_task_types: List[str],
        proficiency: float = 0.0,
        definition_en: Optional[str] = None,
        word_distractors: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Xây dựng tất cả dạng bài tập cho card (backend cung cấp đủ data để frontend render)."""
        options = [{"text": meaning, "is_correct": True}]
        seen_meanings = {meaning.strip().casefold()}
        for distractor in distractors:
            clean_distractor = str(distractor or "").strip()
            normalized_distractor = clean_distractor.casefold()
            if (
                not clean_distractor
                or normalized_distractor in seen_meanings
            ):
                continue
            options.append({"text": clean_distractor, "is_correct": False})
            seen_meanings.add(normalized_distractor)
            if len(options) == 4:
                break
        random.shuffle(options)

        tasks: Dict[str, Any] = {
            "choice": {
                "enabled": "choice" in allowed_task_types,
                "multiple": False,
                "options": options
            },
            "fill": {
                "enabled": "fill" in allowed_task_types,
                "answers": [word.strip().lower()]
            },
            "complete": {
                "enabled": "complete" in allowed_task_types,
                "patterns": DynamicGenerator._create_complete_patterns(word)
            }
        }

        # listen_choice: nghe từ tiếng Anh → chọn nghĩa tiếng Việt
        if "listen_choice" in allowed_task_types or proficiency >= 0:
            tasks["listen_choice"] = {
                "enabled": True,
                "multiple": False,
                "options": options
            }

        # listen_write: nghe từ tiếng Anh → viết từ tiếng Anh
        if "listen_write" in allowed_task_types or proficiency >= 30:
            tasks["listen_write"] = {
                "enabled": True,
                "answers": [word.strip().lower()]
            }

        # def_choice: cho định nghĩa → chọn từ tiếng Anh
        if definition_en and (proficiency >= 50 or "def_choice" in allowed_task_types):
            en_distractors = word_distractors or []
            tasks["def_choice"] = {
                "enabled": True,
                "multiple": False,
                "options": [
                    {"text": word, "is_correct": True},
                    *[{"text": d, "is_correct": False} for d in en_distractors[:3]]
                ]
            }

        # def_write: cho định nghĩa → viết từ tiếng Anh
        if definition_en and (proficiency >= 60 or "def_write" in allowed_task_types):
            tasks["def_write"] = {
                "enabled": True,
                "answers": [word.strip().lower()]
            }

        return tasks


    @classmethod
    async def generate_user_dynamic_cards(
        cls,
        user_id: str,
        settings: FlashcardSettings,
        supabase_client: Any
    ) -> List[FlashcardCard]:
        """
        Tạo danh sách cards động từ kho từ của người dùng theo cấu hình Leitner và ưu tiên ôn tập từ Supabase:
        - Tự động lấy cấu hình khoảng cách box từ repetition_loops trong database
        - Ưu tiên ôn tập theo cấu hình: dịch nhiều/ít nhất, gặp nhiều/ít nhất, hoặc đến hạn (due review)
        - Lọc theo ngưỡng thông thạo bắt đầu ôn tập
        """
        total_cards = settings.total_cards or 20
        leitner = settings.leitner_config or LeitnerConfig()
        allowed_types = settings.allowed_task_types or ["choice", "fill", "complete"]

        words_data: List[Dict[str, Any]] = []
        now_iso = datetime.now(timezone.utc).isoformat()

        # 1. Truy vấn từ Supabase user_words + senses
        if supabase_client:
            try:
                query = supabase_client.table("user_words").select(
                    "word_id, translated_count, words(id, word_text)"
                ).eq("user_id", user_id).limit(150).execute()

                if query.data:
                    for row in query.data:
                        word_obj = row.get("words") or {}
                        word_text = word_obj.get("word_text")
                        if word_text:
                            words_data.append({
                                "word": word_text,
                                "translated_count": row.get("translated_count", 0),
                                "encountered_count": 0,
                                "word_id": row.get("word_id") or word_obj.get("id"),
                                "next_review": None,
                            })
            except Exception as e:
                logger.warning(f"Error querying user_words from Supabase: {e}")

        # 2. Truy vấn user_word_statistics để bổ sung encountered_count
        if supabase_client:
            try:
                stat_query = supabase_client.table("user_word_statistics").select(
                    "word, encountered_count, translated_count, total_count"
                ).eq("user_id", user_id).limit(150).execute()

                if stat_query.data:
                    for s in stat_query.data:
                        w = s.get("word")
                        found = next((item for item in words_data if item["word"].lower() == w.lower()), None)
                        if found:
                            found["encountered_count"] = max(found.get("encountered_count", 0), s.get("encountered_count", 0))
                            found["translated_count"] = max(found.get("translated_count", 0), s.get("translated_count", 0))
                        else:
                            words_data.append({
                                "word": w,
                                "translated_count": s.get("translated_count", 0),
                                "encountered_count": s.get("encountered_count", 0),
                                "word_id": None,
                                "next_review": None,
                            })
            except Exception as e:
                logger.debug(f"Error querying user_word_statistics: {e}")

        # 3. Lấy điểm thông thạo, Leitner box & hạn ôn tập từ user_sense_progress (Supabase)
        for item in words_data:
            w = item["word"]
            item["proficiency"] = 0.0
            item["leitner_box"] = 1
            item["attempts"] = item.get("encountered_count", 0) + item.get("translated_count", 0)

            # Lấy từ Supabase user_sense_progress
            if supabase_client:
                try:
                    word_id = item.get("word_id")
                    if not word_id:
                        word_res = supabase_client.table("words").select(
                            "id"
                        ).eq("word_text", w.lower()).maybe_single().execute()
                        word_id = word_res.data.get("id") if word_res and word_res.data else None

                    if word_id:
                        sense_res = supabase_client.table("senses").select(
                            "id, meaning_vi, ipa, definition_en, definition_vi, example_en"
                        ).eq("word_id", word_id).limit(20).execute()
                        sense_candidates = [
                            sense for sense in (sense_res.data or [])
                            if str(sense.get("meaning_vi") or "").strip()
                        ]
                    else:
                        sense_candidates = []

                    if sense_candidates:
                        sense_data = max(
                            sense_candidates,
                            key=lambda sense: bool(str(sense.get("example_en") or "").strip()),
                        )
                        sense_pk = sense_data.get("id")
                        item["word_id"] = word_id
                        item["sense"] = sense_data
                        item["sense_id"] = sense_pk
                        prog_res = supabase_client.table("user_sense_progress").select(
                            "mastery_score, current_repetition_id, next_review, wrong_count"
                        ).eq("user_id", user_id).eq("sense_id", sense_pk).maybe_single().execute()
                        if prog_res and prog_res.data:
                            p_data = prog_res.data
                            item["proficiency"] = p_data.get("mastery_score", 0.0)
                            item["leitner_box"] = p_data.get("current_repetition_id") or 1
                            item["next_review"] = p_data.get("next_review")
                except Exception:
                    pass

        # 4. Lọc theo ngưỡng thông thạo bắt đầu ôn tập
        min_th = leitner.min_threshold
        max_th = leitner.max_threshold
        filtered_words = [
            w for w in words_data
            if min_th <= w.get("proficiency", 0.0) <= max_th
        ]

        if not filtered_words:
            filtered_words = words_data

        # 5. Sắp xếp theo ưu tiên cấu hình (Mục 3 spec)
        p = leitner.priority
        if p == "translate_desc":
            filtered_words.sort(key=lambda x: x.get("translated_count", 0), reverse=True)
        elif p == "translate_asc":
            filtered_words.sort(key=lambda x: x.get("translated_count", 0))
        elif p == "encounter_desc":
            filtered_words.sort(key=lambda x: x.get("encountered_count", 0), reverse=True)
        elif p == "encounter_asc":
            filtered_words.sort(key=lambda x: x.get("encountered_count", 0))
        elif p == "total_asc":
            filtered_words.sort(key=lambda x: x.get("translated_count", 0) + x.get("encountered_count", 0))
        elif p == "due_first":
            # Ưu tiên các từ tới hạn hoặc quá hạn ôn tập Leitner
            filtered_words.sort(key=lambda x: (x.get("next_review") or "") > now_iso)
        else:  # default total_desc
            filtered_words.sort(key=lambda x: x.get("translated_count", 0) + x.get("encountered_count", 0), reverse=True)

        selected_words = filtered_words[:total_cards]

        # 6. Build choices from actual translations, never from placeholder meanings.
        sense_items = [item for item in selected_words if item.get("sense")]

        available_meanings = list(dict.fromkeys(
            str(entry["sense"].get("meaning_vi") or "").strip()
            for entry in sense_items
        ))
        cards: List[FlashcardCard] = []
        for item in sense_items:
            word_str = item["word"]
            s_data = item["sense"]
            meaning = str(s_data.get("meaning_vi") or "").strip()
            sense_id = s_data.get("id") or item.get("sense_id")
            distractors = [
                candidate
                for candidate in available_meanings
                if candidate.casefold() != meaning.casefold()
            ]

            prof = item.get("proficiency", 0.0)
            context_str = s_data.get("example_en")
            def_en = s_data.get("definition_en")
            def_vi = s_data.get("definition_vi")

            # Backend chọn task type phù hợp theo proficiency (spec mục 4)
            selected_task = cls._select_task_type(
                proficiency=prof,
                allowed_task_types=allowed_types,
                has_context=bool(context_str and context_str.strip()),
                has_definition_en=bool(def_en and def_en.strip()),
            )
            question_txt = cls._build_question_text(
                task_type=selected_task,
                word=word_str,
                meaning=meaning,
                context=context_str,
                definition_en=def_en,
                definition_vi=def_vi,
            )

            tasks = cls._build_card_tasks(
                word=word_str,
                meaning=meaning,
                distractors=distractors,
                allowed_task_types=allowed_types,
                proficiency=prof,
                definition_en=def_en
            )

            card = FlashcardCard(
                id=f"dyn_user_{uuid.uuid4().hex[:8]}",
                word=word_str,
                meaning=meaning,
                ipa=s_data.get("ipa"),
                question="",
                hint=def_vi or def_en or f"Bắt đầu bằng chữ '{word_str[0]}'",
                context=context_str,
                definition_en=def_en,
                definition_vi=def_vi,
                difficulty="medium" if prof >= 0 else "easy",
                timer=settings.per_card_timer or 15,
                points=10,
                tasks=tasks,
                sense_id=sense_id,
                user_proficiency=prof,
                user_attempts=item.get("attempts", 0),
                leitner_box=item.get("leitner_box", 1),
                selected_task_type=selected_task,
                question_text=question_txt,
            )
            cards.append(card)

        return cards

    @classmethod
    async def generate_system_dynamic_cards(
        cls,
        settings: FlashcardSettings,
        supabase_client: Any
    ) -> List[FlashcardCard]:
        """
        Tạo danh sách cards động từ kho từ vựng toàn hệ thống (bảng senses và words).
        """
        total_cards = settings.total_cards or 20
        allowed_types = settings.allowed_task_types or ["choice", "fill", "complete"]

        cards: List[FlashcardCard] = []
        items = []

        if supabase_client:
            try:
                senses_res = supabase_client.table("senses").select(
                    "id, meaning_vi, ipa, definition_en, definition_vi, example_en, words(word_text)"
                ).limit(100).execute()
                if senses_res and senses_res.data:
                    for row in senses_res.data:
                        w_obj = row.get("words") or {}
                        w_text = w_obj.get("word_text")
                        if w_text and str(row.get("meaning_vi") or "").strip():
                            items.append({
                                "id": row.get("id"),
                                "word": w_text,
                                "meaning_vi": row.get("meaning_vi"),
                                "ipa": row.get("ipa"),
                                "definition_en": row.get("definition_en"),
                                "definition_vi": row.get("definition_vi"),
                                "example_en": row.get("example_en"),
                            })
            except Exception as e:
                logger.warning(f"Error fetching system senses: {e}")

        if not items:
            return []

        random.shuffle(items)
        selected = items[:total_cards]
        all_meanings = list(dict.fromkeys(
            str(it.get("meaning_vi") or "").strip()
            for it in items
            if str(it.get("meaning_vi") or "").strip()
        ))

        for it in selected:
            word_str = it.get("word") or "word"
            meaning = it.get("meaning_vi") or "nghĩa"
            context_str = it.get("example_en")
            def_en = it.get("definition_en")
            def_vi = it.get("definition_vi")
            distractors = [m for m in all_meanings if m != meaning]
            random.shuffle(distractors)

            # System dynamic: proficiency=0, backend chọn task type theo spec
            selected_task = cls._select_task_type(
                proficiency=0.0,
                allowed_task_types=allowed_types,
                has_context=bool(context_str and context_str.strip()),
                has_definition_en=bool(def_en and def_en.strip()),
            )
            question_txt = cls._build_question_text(
                task_type=selected_task,
                word=word_str,
                meaning=meaning,
                context=context_str,
                definition_en=def_en,
                definition_vi=def_vi,
            )

            tasks = cls._build_card_tasks(
                word=word_str,
                meaning=meaning,
                distractors=distractors,
                allowed_task_types=allowed_types,
                proficiency=0.0,
                definition_en=def_en
            )

            card = FlashcardCard(
                id=f"dyn_sys_{uuid.uuid4().hex[:8]}",
                word=word_str,
                meaning=meaning,
                ipa=it.get("ipa"),
                question="",
                hint=def_en or f"Chữ cái đầu: {word_str[0]}",
                context=context_str,
                definition_en=def_en,
                definition_vi=def_vi,
                difficulty="medium",
                timer=settings.per_card_timer or 15,
                points=10,
                tasks=tasks,
                sense_id=it.get("id"),
                user_proficiency=0.0,
                user_attempts=0,
                leitner_box=1,
                selected_task_type=selected_task,
                question_text=question_txt,
            )
            cards.append(card)

        return cards
