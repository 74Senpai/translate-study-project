-- ==============================================================================
-- Translate Platform - Supabase PostgreSQL Schema
-- File: backend/database/schema.sql
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Utility Trigger Function: updated_at
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Users Table (Profile linked to Supabase auth.users & Google OAuth Provider)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(255) NULL,                   -- Username từ Google metadata/email prefix
    user_name VARCHAR(255) NULL,                  -- Alias tương thích
    name TEXT NULL,                               -- Tên đầy đủ từ provider
    display_name VARCHAR(255) NULL,               -- Tên hiển thị
    email VARCHAR(255) NULL,                      -- Email từ Supabase Auth
    avatar_url TEXT NULL,                         -- avatar_url (avata-url) từ Google
    password TEXT NULL,                           -- Null vì đăng nhập qua Provider (Google OAuth)
    hash_password TEXT NULL,                      -- Nullable
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_uniq ON public.users(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Trigger đảm bảo user_name luôn đồng bộ với username
CREATE OR REPLACE FUNCTION public.sync_user_name_alias()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.username IS NOT NULL AND NEW.user_name IS NULL THEN
        NEW.user_name = NEW.username;
    ELSIF NEW.user_name IS NOT NULL AND NEW.username IS NULL THEN
        NEW.username = NEW.user_name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_name ON public.users;
CREATE TRIGGER trg_sync_user_name
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_user_name_alias();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- 4. Senses Table (Kho tri thức & Cache WSD tái sử dụng toàn hệ thống)
CREATE TABLE IF NOT EXISTS public.senses (
    id VARCHAR(150) PRIMARY KEY,                  -- Ví dụ: ctx_wn_bank.n.01
    meaning TEXT NOT NULL,                        -- Nghĩa tiếng Việt của sense
    match_count INT NOT NULL DEFAULT 1,           -- Số lần sense này được match
    confidence NUMERIC(5, 4) NOT NULL DEFAULT 1.0, -- confiden: độ tin cậy WSD
    trusted BOOLEAN NOT NULL DEFAULT false,       -- Vượt ngưỡng trust hoặc đã verify
    rate NUMERIC(3, 2) NOT NULL DEFAULT 0.0,      -- Đánh giá chất lượng 0 - 5.0
    define TEXT NULL,                             -- Định nghĩa gốc
    example TEXT NULL,                            -- Ví dụ mẫu chuẩn
    pos VARCHAR(30) NULL,                         -- Từ loại (noun, verb, adj...)
    ipa VARCHAR(100) NULL,                        -- Phiên âm quốc tế IPA
    synonyms TEXT[] NOT NULL DEFAULT '{}'::TEXT[],-- Danh sách từ đồng nghĩa
    antonyms TEXT[] NOT NULL DEFAULT '{}'::TEXT[],-- Danh sách từ trái nghĩa
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_senses_pos ON public.senses(pos);
CREATE INDEX IF NOT EXISTS idx_senses_trusted ON public.senses(trusted);
CREATE INDEX IF NOT EXISTS idx_senses_match_count ON public.senses(match_count DESC);
CREATE INDEX IF NOT EXISTS idx_senses_synonyms ON public.senses USING gin(synonyms);

DROP TRIGGER IF EXISTS trg_senses_updated_at ON public.senses;
CREATE TRIGGER trg_senses_updated_at
    BEFORE UPDATE ON public.senses
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- 5. User Words Table (Mỗi user có 1 bản ghi duy nhất cho 1 từ)
CREATE TABLE IF NOT EXISTS public.user_words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    text VARCHAR(255) NOT NULL,                   -- Từ hoặc cụm từ
    translate_count INT NOT NULL DEFAULT 1,       -- Số lần dịch
    review_count INT NOT NULL DEFAULT 0,          -- Số lần ôn tập
    last_translate TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_review TIMESTAMPTZ NULL,                 -- Lần ôn tập gần nhất
    repetition_loop INT NOT NULL DEFAULT 0,       -- Vòng lặp SRS
    next_repetition TIMESTAMPTZ NULL,             -- Lần lặp tiếp theo
    status VARCHAR(50) NOT NULL DEFAULT 'learning', -- 'new', 'learning', 'reviewing', 'mastered', 'archived'
    wrong_count INT NOT NULL DEFAULT 0,           -- Số lần trả lời sai
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_words_user_text UNIQUE (user_id, text)
);

CREATE INDEX IF NOT EXISTS idx_user_words_user_id ON public.user_words(user_id);
CREATE INDEX IF NOT EXISTS idx_user_words_status ON public.user_words(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_words_next_repetition ON public.user_words(user_id, next_repetition);
CREATE INDEX IF NOT EXISTS idx_user_words_text ON public.user_words(text);

DROP TRIGGER IF EXISTS trg_user_words_updated_at ON public.user_words;
CREATE TRIGGER trg_user_words_updated_at
    BEFORE UPDATE ON public.user_words
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- 6. Word Meanings Table (Nhiều nghĩa theo ngữ cảnh của 1 user word)
CREATE TABLE IF NOT EXISTS public.word_meanings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_word_id UUID NOT NULL REFERENCES public.user_words(id) ON DELETE CASCADE,
    sense_id VARCHAR(150) NULL REFERENCES public.senses(id) ON DELETE SET NULL, -- senseid
    meaning TEXT NOT NULL,                        -- Nghĩa trong ngữ cảnh
    context TEXT NULL,                            -- Câu ngữ cảnh
    define TEXT NULL,                             -- Định nghĩa
    example TEXT NULL,                            -- Ví dụ
    pos VARCHAR(30) NULL,                         -- POS
    ipa VARCHAR(100) NULL,                        -- IPA
    synonyms TEXT[] NOT NULL DEFAULT '{}'::TEXT[],-- Synonyms
    antonyms TEXT[] NOT NULL DEFAULT '{}'::TEXT[],-- Antonyms
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_word_meanings_user_word_id ON public.word_meanings(user_word_id);
CREATE INDEX IF NOT EXISTS idx_word_meanings_sense_id ON public.word_meanings(sense_id);

DROP TRIGGER IF EXISTS trg_word_meanings_updated_at ON public.word_meanings;
CREATE TRIGGER trg_word_meanings_updated_at
    BEFORE UPDATE ON public.word_meanings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- 7. Flashcard Statistics Table (1:1 với word_meaning để thống kê và tạo flashcard)
CREATE TABLE IF NOT EXISTS public.flashcard_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_meaning_id UUID NOT NULL UNIQUE REFERENCES public.word_meanings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    hard_score NUMERIC(5, 2) NOT NULL DEFAULT 2.50, -- Hệ số độ khó SRS (Ease factor)
    repe_loop INT NOT NULL DEFAULT 0,             -- Chu kỳ lặp SRS
    next_review TIMESTAMPTZ NULL,                 -- Thời điểm ôn tập tiếp theo
    last_review TIMESTAMPTZ NULL,                 -- Thời điểm ôn tập gần nhất
    success_count INT NOT NULL DEFAULT 0,         -- Số lần đúng tổng cộng
    review_count INT NOT NULL DEFAULT 0,          -- Tổng số lượt ôn tập
    chose_fail_count INT NOT NULL DEFAULT 0,      -- Trắc nghiệm sai
    chose_true_count INT NOT NULL DEFAULT 0,      -- Trắc nghiệm đúng
    fill_fail_count INT NOT NULL DEFAULT 0,       -- Điền từ sai
    fill_true_count INT NOT NULL DEFAULT 0,       -- Điền từ đúng
    write_fail_count INT NOT NULL DEFAULT 0,      -- Gõ/viết sai
    write_true_count INT NOT NULL DEFAULT 0,      -- Gõ/viết đúng
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_flashcard_statistics_user_id ON public.flashcard_statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_statistics_next_review ON public.flashcard_statistics(user_id, next_review);
CREATE INDEX IF NOT EXISTS idx_flashcard_statistics_meaning_id ON public.flashcard_statistics(word_meaning_id);

DROP TRIGGER IF EXISTS trg_flashcard_statistics_updated_at ON public.flashcard_statistics;
CREATE TRIGGER trg_flashcard_statistics_updated_at
    BEFORE UPDATE ON public.flashcard_statistics
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- 8. User Word Statistics Table (Thống kê số lần gặp 1 từ, số lần dịch 1 từ)
CREATE TABLE IF NOT EXISTS public.user_word_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    word VARCHAR(255) NOT NULL,
    encountered_count INT NOT NULL DEFAULT 1,     -- Số lần gặp từ
    translated_count INT NOT NULL DEFAULT 1,      -- Số lần dịch từ
    total_count INT NOT NULL DEFAULT 2,           -- Tổng số lần tương tác
    last_seen TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    source_counts JSONB NOT NULL DEFAULT '{"web": 1}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_word_stats UNIQUE (user_id, word)
);

CREATE INDEX IF NOT EXISTS idx_user_word_stats_user_id ON public.user_word_statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_word_stats_word ON public.user_word_statistics(word);
CREATE INDEX IF NOT EXISTS idx_user_word_stats_last_seen ON public.user_word_statistics(user_id, last_seen DESC);

DROP TRIGGER IF EXISTS trg_user_word_statistics_updated_at ON public.user_word_statistics;
CREATE TRIGGER trg_user_word_statistics_updated_at
    BEFORE UPDATE ON public.user_word_statistics
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- 9. User Overall Statistics Table (Thống kê tổng thể tài khoản user)
CREATE TABLE IF NOT EXISTS public.user_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    total_words_saved INT NOT NULL DEFAULT 0,
    total_translations INT NOT NULL DEFAULT 0,
    total_words_encountered INT NOT NULL DEFAULT 0,
    total_reviews INT NOT NULL DEFAULT 0,
    total_mastered_words INT NOT NULL DEFAULT 0,
    streak_days INT NOT NULL DEFAULT 0,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_statistics_user_id ON public.user_statistics(user_id);

DROP TRIGGER IF EXISTS trg_user_statistics_updated_at ON public.user_statistics;
CREATE TRIGGER trg_user_statistics_updated_at
    BEFORE UPDATE ON public.user_statistics
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- 10. Automation Trigger: Tự động khởi tạo flashcard_statistics khi tạo word_meaning
CREATE OR REPLACE FUNCTION public.handle_auto_create_flashcard_statistics()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.user_words
    WHERE id = NEW.user_word_id;

    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.flashcard_statistics (
            word_meaning_id,
            user_id,
            hard_score,
            repe_loop,
            next_review
        ) VALUES (
            NEW.id,
            v_user_id,
            2.50,
            0,
            timezone('utc'::text, now())
        )
        ON CONFLICT (word_meaning_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_create_flashcard_stat ON public.word_meanings;
CREATE TRIGGER trg_auto_create_flashcard_stat
    AFTER INSERT ON public.word_meanings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auto_create_flashcard_statistics();

-- 10B. Automation Trigger: Tự động đồng bộ User Profile từ Supabase Auth Provider
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (
        id,
        email,
        username,
        user_name,
        name,
        display_name,
        avatar_url
    ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'preferred_username', split_part(NEW.email, '@', 1), NEW.id::text),
        COALESCE(NEW.raw_user_meta_data->>'preferred_username', split_part(NEW.email, '@', 1), NEW.id::text),
        NEW.raw_user_meta_data->>'name',
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, public.users.email),
        username = COALESCE(EXCLUDED.username, public.users.username),
        name = COALESCE(EXCLUDED.name, public.users.name),
        display_name = COALESCE(EXCLUDED.display_name, public.users.display_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = timezone('utc'::text, now());

    INSERT INTO public.user_statistics (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();


-- 11. Helper Function: Upsert Sense Cache
CREATE OR REPLACE FUNCTION public.upsert_sense_cache(
    p_id VARCHAR(150),
    p_meaning TEXT,
    p_define TEXT DEFAULT NULL,
    p_example TEXT DEFAULT NULL,
    p_pos VARCHAR(30) DEFAULT NULL,
    p_ipa VARCHAR(100) DEFAULT NULL,
    p_synonyms TEXT[] DEFAULT '{}'::TEXT[],
    p_antonyms TEXT[] DEFAULT '{}'::TEXT[],
    p_confidence NUMERIC DEFAULT 1.0,
    p_trusted BOOLEAN DEFAULT false,
    p_rate NUMERIC DEFAULT 0.0
)
RETURNS public.senses AS $$
DECLARE
    v_sense public.senses;
BEGIN
    INSERT INTO public.senses (
        id, meaning, define, example, pos, ipa,
        synonyms, antonyms, confidence, trusted, rate, match_count
    )
    VALUES (
        p_id, p_meaning, p_define, p_example, p_pos, p_ipa,
        p_synonyms, p_antonyms, p_confidence, p_trusted, p_rate, 1
    )
    ON CONFLICT (id) DO UPDATE SET
        match_count = public.senses.match_count + 1,
        meaning = COALESCE(EXCLUDED.meaning, public.senses.meaning),
        define = COALESCE(EXCLUDED.define, public.senses.define),
        example = COALESCE(EXCLUDED.example, public.senses.example),
        confidence = GREATEST(public.senses.confidence, EXCLUDED.confidence),
        trusted = (public.senses.trusted OR EXCLUDED.trusted),
        updated_at = timezone('utc'::text, now())
    RETURNING * INTO v_sense;

    RETURN v_sense;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Helper Function: Record Word Interaction (gặp từ hoặc dịch từ)
CREATE OR REPLACE FUNCTION public.record_word_interaction(
    p_user_id UUID,
    p_word VARCHAR(255),
    p_is_translate BOOLEAN DEFAULT false,
    p_source VARCHAR(50) DEFAULT 'web'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_word_statistics (
        user_id,
        word,
        encountered_count,
        translated_count,
        total_count,
        last_seen,
        source_counts
    )
    VALUES (
        p_user_id,
        lower(trim(p_word)),
        CASE WHEN p_is_translate THEN 0 ELSE 1 END,
        CASE WHEN p_is_translate THEN 1 ELSE 0 END,
        1,
        timezone('utc'::text, now()),
        jsonb_build_object(p_source, 1)
    )
    ON CONFLICT (user_id, word) DO UPDATE SET
        encountered_count = public.user_word_statistics.encountered_count + (CASE WHEN p_is_translate THEN 0 ELSE 1 END),
        translated_count = public.user_word_statistics.translated_count + (CASE WHEN p_is_translate THEN 1 ELSE 0 END),
        total_count = public.user_word_statistics.total_count + 1,
        last_seen = timezone('utc'::text, now()),
        source_counts = jsonb_set(
            public.user_word_statistics.source_counts,
            ARRAY[p_source],
            to_jsonb(COALESCE((public.user_word_statistics.source_counts->>p_source)::int, 0) + 1)
        ),
        updated_at = timezone('utc'::text, now());

    UPDATE public.user_statistics
    SET total_translations = total_translations + (CASE WHEN p_is_translate THEN 1 ELSE 0 END),
        total_words_encountered = total_words_encountered + (CASE WHEN p_is_translate THEN 0 ELSE 1 END),
        last_active_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.senses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_meanings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_word_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow public read access to senses" ON public.senses;
CREATE POLICY "Allow public read access to senses" ON public.senses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert senses" ON public.senses;
CREATE POLICY "Allow authenticated users to insert senses" ON public.senses FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow authenticated users to update senses" ON public.senses;
CREATE POLICY "Allow authenticated users to update senses" ON public.senses FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users manage own words" ON public.user_words;
CREATE POLICY "Users manage own words" ON public.user_words FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own word meanings" ON public.word_meanings;
CREATE POLICY "Users manage own word meanings" ON public.word_meanings FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_words WHERE public.user_words.id = public.word_meanings.user_word_id AND public.user_words.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_words WHERE public.user_words.id = public.word_meanings.user_word_id AND public.user_words.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users manage own flashcard stats" ON public.flashcard_statistics;
CREATE POLICY "Users manage own flashcard stats" ON public.flashcard_statistics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own word stats" ON public.user_word_statistics;
CREATE POLICY "Users manage own word stats" ON public.user_word_statistics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own overall statistics" ON public.user_statistics;
CREATE POLICY "Users view own overall statistics" ON public.user_statistics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 14. Views Compatibility (Singular Aliases)
CREATE OR REPLACE VIEW public.word_meaning AS SELECT * FROM public.word_meanings;
CREATE OR REPLACE VIEW public.flashcard_statics AS SELECT * FROM public.flashcard_statistics;
CREATE OR REPLACE VIEW public.user_statics AS SELECT * FROM public.user_statistics;
CREATE OR REPLACE VIEW public.user_word_statics AS SELECT * FROM public.user_word_statistics;

-- 15. View Flashcard Học tập đầy đủ
CREATE OR REPLACE VIEW public.v_flashcards_ready AS
SELECT 
    fs.id AS flashcard_id,
    fs.user_id,
    uw.id AS user_word_id,
    uw.text AS word,
    uw.status AS word_status,
    wm.id AS word_meaning_id,
    wm.meaning,
    wm.context,
    wm.define,
    wm.example,
    wm.pos,
    wm.ipa,
    wm.synonyms,
    wm.antonyms,
    s.id AS sense_id,
    s.trusted AS is_sense_trusted,
    fs.hard_score,
    fs.repe_loop,
    fs.next_review,
    fs.last_review,
    fs.success_count,
    fs.review_count,
    fs.chose_fail_count,
    fs.chose_true_count,
    fs.fill_fail_count,
    fs.fill_true_count,
    fs.write_fail_count,
    fs.write_true_count,
    (fs.next_review <= timezone('utc'::text, now())) AS is_due_for_review
FROM public.flashcard_statistics fs
JOIN public.word_meanings wm ON fs.word_meaning_id = wm.id
JOIN public.user_words uw ON wm.user_word_id = uw.id
LEFT JOIN public.senses s ON wm.sense_id = s.id;
