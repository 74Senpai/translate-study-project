import pytest
from unittest.mock import MagicMock
from src.translate.models.vocab_model import VocabItem
from src.translate.repositories.supabase_vocab_repository import SupabaseVocabRepository
from src.translate.repositories.vocab_repository import VocabRepository
from src.translate.models.vocab_db_models import (
    WordModel,
    SenseModel,
    UserWordModel,
    UserSenseProgressModel,
    UserSenseNoteModel,
    UserSenseStatsModel,
    UserStatsModel,
    UserSenseAttemptModel,
)


class MockTable:
    def __init__(self, name: str, tables_store: dict):
        self.name = name
        self.tables_store = tables_store
        self._filters = {}
        self._updates = None
        self._payload = None
        self._op = "select"
        self._is_single = False
        self._limit = None

    def select(self, *args, **kwargs):
        self._op = "select"
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def lte(self, col, val):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, lim):
        self._limit = lim
        return self

    def maybe_single(self):
        self._is_single = True
        return self

    def single(self):
        self._is_single = True
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, updates):
        self._op = "update"
        self._updates = updates
        return self

    def upsert(self, payload, on_conflict=None):
        return self.insert(payload)

    def execute(self):
        mock_res = MagicMock()
        if self._op == "insert":
            payload = self._payload
            if not isinstance(payload, list):
                payload = [dict(payload)]
            else:
                payload = [dict(p) for p in payload]
            for item in payload:
                if "id" not in item or not item["id"]:
                    import uuid
                    item["id"] = str(uuid.uuid4())
                self.tables_store.setdefault(self.name, []).append(item)
            mock_res.data = payload
            return mock_res

        if self._op == "update":
            records = self.tables_store.get(self.name, [])
            updated = []
            for r in records:
                match = True
                for k, v in self._filters.items():
                    if r.get(k) != v:
                        match = False
                        break
                if match:
                    r.update(self._updates)
                    updated.append(r)
            mock_res.data = updated
            return mock_res

        # select
        records = self.tables_store.get(self.name, [])
        filtered = []
        for r in records:
            match = True
            for k, v in self._filters.items():
                if r.get(k) != v:
                    match = False
                    break
            if match:
                filtered.append(r)

        if self._is_single:
            mock_res.data = filtered[0] if filtered else None
        else:
            mock_res.data = filtered
        return mock_res
        return self.insert(payload)


class MockSupabaseClient:
    def __init__(self):
        self.store = {}

    def table(self, table_name: str):
        return MockTable(table_name, self.store)


@pytest.fixture
def mock_repo():
    mock_client = MockSupabaseClient()
    return SupabaseVocabRepository(client=mock_client), mock_client


def test_unauthenticated_user_only_saves_unbound_tables(mock_repo):
    """
    Trường hợp user chưa đăng nhập (user_id=None):
    Chỉ lưu vào các bảng không ràng buộc: words, senses (và word_forms).
    KHÔNG lưu vào user_words, user_sense_progress, user_sense_notes,
    user_sense_stats, user_stats, user_sense_attempts.
    """
    repo, client = mock_repo

    vocab_item = VocabItem(
        word="algorithm",
        contextual_meaning="thuật toán",
        context_sentence="An algorithm is a step-by-step procedure.",
        concept_definition="a process or set of rules to be followed in calculations",
        simple_example="Sorting algorithms are fundamental.",
        synonyms=["procedure", "formula"],
        antonyms=[],
        context_id="ctx_wn_algorithm.n.01",
        similarity_score=0.92,
        is_trusted=True,
        pos="NOUN",
        ipa="/ˈæl.ɡə.rɪ.ðəm/",
    )

    # User chưa đăng nhập -> user_id=None
    result = repo.save_translation_vocab_item(vocab_item, user_id=None)

    assert result is not None
    assert "word" in result
    assert "sense" in result
    assert "user_id" not in result

    # Kiểm tra bảng words và senses đã được ghi nhận
    assert len(client.store.get("words", [])) == 1
    assert client.store["words"][0]["word_text"] == "algorithm"

    assert len(client.store.get("senses", [])) == 1
    sense_rec = client.store["senses"][0]
    assert sense_rec["meaning_vi"] == "thuật toán"
    assert sense_rec["match_count"] >= 1
    assert sense_rec["confidence_score"] == 0.92
    assert sense_rec["is_trusted"] is True
    assert sense_rec["part_of_speech"] == "NOUN"

    # KIỂM TRA BẢNG RÀNG BUỘC USER: HOÀN TOÀN TRỐNG!
    assert len(client.store.get("user_words", [])) == 0
    assert len(client.store.get("user_sense_progress", [])) == 0
    assert len(client.store.get("user_sense_notes", [])) == 0
    assert len(client.store.get("user_sense_stats", [])) == 0
    assert len(client.store.get("user_stats", [])) == 0
    assert len(client.store.get("user_sense_attempts", [])) == 0


def test_authenticated_user_saves_all_tables_and_stats(mock_repo):
    """
    Trường hợp user đã đăng nhập (user_id='user_123'):
    Lưu đầy đủ vào words, senses, user_words, user_sense_progress,
    user_sense_notes, user_sense_stats, user_stats, user_sense_attempts.
    """
    repo, client = mock_repo
    user_id = "00000000-0000-0000-0000-000000000001"

    vocab_item = VocabItem(
        word="neural",
        contextual_meaning="thuộc về thần kinh",
        context_sentence="Neural networks are inspired by the brain.",
        concept_definition="relating to a nerve or the nervous system",
        simple_example="neural pathways in the brain",
        synonyms=["nervous"],
        antonyms=[],
        context_id="ctx_wn_neural.a.01",
        similarity_score=0.88,
        is_trusted=True,
        pos="ADJ",
    )

    result = repo.save_translation_vocab_item(vocab_item, user_id=user_id)

    assert result is not None
    assert result.get("user_id") == user_id

    # 1. Bảng dùng chung
    assert len(client.store.get("words", [])) == 1
    word_id = client.store["words"][0]["id"]
    assert client.store["words"][0]["word_text"] == "neural"

    assert len(client.store.get("senses", [])) == 1
    sense_id = client.store["senses"][0]["id"]
    assert client.store["senses"][0]["meaning_vi"] == "thuộc về thần kinh"

    # 2. Bảng user_words
    user_words = client.store.get("user_words", [])
    assert len(user_words) == 1
    assert user_words[0]["user_id"] == user_id
    assert user_words[0]["word_id"] == word_id
    assert user_words[0]["translated_count"] >= 1

    # 3. Bảng user_sense_progress
    sense_progs = client.store.get("user_sense_progress", [])
    assert len(sense_progs) == 1
    assert sense_progs[0]["user_id"] == user_id
    assert sense_progs[0]["sense_id"] == sense_id

    # 4. Bảng user_sense_notes
    notes = client.store.get("user_sense_notes", [])
    assert len(notes) == 1
    assert notes[0]["context"] == "Neural networks are inspired by the brain."
    assert notes[0]["meaning_note"] == "thuộc về thần kinh"

    # 5. Bảng user_sense_stats
    stats = client.store.get("user_sense_stats", [])
    assert len(stats) == 1
    assert stats[0]["user_id"] == user_id
    assert stats[0]["sense_id"] == sense_id

    # 6. Bảng user_stats
    u_stats = client.store.get("user_stats", [])
    assert len(u_stats) == 1
    assert u_stats[0]["user_id"] == user_id
    assert u_stats[0]["total_word_match"] >= 1
    assert u_stats[0]["total_sense_match"] >= 1

    # 7. Bảng user_sense_attempts
    attempts = client.store.get("user_sense_attempts", [])
    assert len(attempts) == 1
    assert attempts[0]["activity_type"] == "translate"
    assert attempts[0]["is_correct"] is True
    assert attempts[0]["user_answer"] == "thuộc về thần kinh"


def test_repeated_translation_increments_match_count_and_user_counts(mock_repo):
    """
    Khi dịch lại từ hoặc nghĩa đã tồn tại:
    - match_count trong senses tăng lên
    - translated_count trong user_words và user_sense_progress tăng lên
    """
    repo, client = mock_repo
    user_id = "00000000-0000-0000-0000-000000000002"

    item = VocabItem(
        word="intelligence",
        contextual_meaning="trí tuệ",
        context_sentence="Artificial intelligence is transforming society.",
        context_id="ctx_wn_intelligence.n.01",
        similarity_score=0.95,
        is_trusted=True,
    )

    # Lần dịch thứ 1
    repo.save_translation_vocab_item(item, user_id=user_id)
    assert client.store["senses"][0]["match_count"] == 1
    assert client.store["user_words"][0]["translated_count"] == 1
    assert client.store["user_sense_progress"][0]["translated_count"] == 1

    # Lần dịch thứ 2
    repo.save_translation_vocab_item(item, user_id=user_id)
    assert client.store["senses"][0]["match_count"] == 2
    assert client.store["user_words"][0]["translated_count"] == 2
    assert client.store["user_sense_progress"][0]["translated_count"] == 2


def test_extraction_methods(mock_repo):
    """
    Kiểm tra các hàm trích xuất dữ liệu:
    - get_user_word_with_meanings
    - get_user_overall_stats
    """
    repo, client = mock_repo
    user_id = "00000000-0000-0000-0000-000000000003"

    item = VocabItem(
        word="computer",
        contextual_meaning="máy vi tính",
        context_sentence="I use a computer every day.",
        context_id="ctx_wn_computer.n.01",
    )
    repo.save_translation_vocab_item(item, user_id=user_id)

    # Trích xuất từ vựng và tiến độ cá nhân
    extracted = repo.get_user_word_with_meanings(user_id=user_id, word_text="computer")
    assert extracted is not None
    assert extracted["word"]["word_text"] == "computer"
    assert extracted["user_word"]["translated_count"] == 1
    assert len(extracted["senses"]) >= 1
    assert extracted["senses"][0]["meaning_vi"] == "máy vi tính"
    assert extracted["senses"][0]["progress"] is not None
    assert extracted["senses"][0]["notes"] is not None

    # Trích xuất thống kê tổng quát
    stats = repo.get_user_overall_stats(user_id=user_id)
    assert stats is not None
    assert stats["total_word_match"] >= 1
    assert stats["total_sense_match"] >= 1


def test_flashcard_review_updates_stats_and_progression(mock_repo):
    """
    Kiểm tra update_flashcard_review:
    - Cập nhật user_sense_stats (choose_true_count, choose_fail_count, v.v.)
    - Cập nhật user_sense_progress (next_review, last_review, current_repetition_id)
    - Ghi nhận lịch sử làm bài vào user_sense_attempts
    """
    repo, client = mock_repo
    user_id = "00000000-0000-0000-0000-000000000004"
    sense_id = "00000000-0000-0000-0000-000000000005"

    # 1. Trả lời đúng dạng bài 'choose'
    repo.update_flashcard_review(
        user_id=user_id,
        sense_id=sense_id,
        is_success=True,
        exercise_type="choose",
        new_hard_score=1.5,
        next_review_iso="2026-10-18T12:00:00Z",
        repetition_loop_id=1,
    )

    stats = client.store.get("user_sense_stats", [])
    assert len(stats) >= 1
    assert stats[0]["choose_true_count"] == 1
    assert stats[0]["hard_score"] == 1.5

    attempts = client.store.get("user_sense_attempts", [])
    assert len(attempts) >= 1
    assert attempts[-1]["activity_type"] == "choose"
    assert attempts[-1]["is_correct"] is True

    # 2. Trả lời sai dạng bài 'fill'
    repo.update_flashcard_review(
        user_id=user_id,
        sense_id=sense_id,
        is_success=False,
        exercise_type="fill",
    )
    assert stats[0]["fill_fail_count"] == 1
    assert len(attempts) >= 2
    assert attempts[-1]["activity_type"] == "fill"
    assert attempts[-1]["is_correct"] is False


@pytest.mark.asyncio
async def test_stats_service_with_user_id(mock_repo):
    """
    Kiểm tra StatsService khi có user_id và khi không có user_id:
    - Khi có user_id: ghi nhận từ vựng vào user_words
    - Khi không có user_id: chỉ cập nhật in-memory
    """
    repo, client = mock_repo
    from src.translate.services.stats_service import StatsService
    from src.translate.repositories.stats_repository import StatsRepository

    stats_repo = StatsRepository(supabase_repo=repo)
    service = StatsService(repo=stats_repo)

    # 1. Khách vãng lai (user_id=None)
    res_guest = await service.update_statistics(text="Machine learning model", user_id=None)
    assert res_guest.processed_words_count > 0
    assert "user_id" not in res_guest.metadata
    assert len(client.store.get("user_words", [])) == 0

    # 2. Người dùng đã đăng nhập (user_id)
    auth_user = "00000000-0000-0000-0000-000000000009"
    res_auth = await service.update_statistics(text="Deep learning network", user_id=auth_user)
    assert res_auth.metadata.get("user_id") == auth_user
    assert len(client.store.get("user_words", [])) >= 1

