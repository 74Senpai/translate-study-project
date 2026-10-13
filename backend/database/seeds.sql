-- ==============================================================================
-- Translate Platform - Supabase Seed Data
-- File: backend/database/seeds.sql
-- Run this in Supabase SQL Editor AFTER schema.sql to test sample data
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
    v_word_id UUID;
    v_meaning1_id UUID;
    v_meaning2_id UUID;
BEGIN
    -- 1. Insert Sample Sense (Sense Cache chung toàn hệ thống)
    PERFORM public.upsert_sense_cache(
        p_id => 'ctx_wn_bank.n.01',
        p_meaning => 'Ngân hàng, tổ chức tài chính',
        p_define => 'A financial institution that accepts deposits and channels money into lending activities.',
        p_example => 'She deposited money in the bank.',
        p_pos => 'noun',
        p_ipa => '/bæŋk/',
        p_synonyms => ARRAY['banking company', 'depository financial institution'],
        p_antonyms => ARRAY[]::TEXT[],
        p_confidence => 0.95,
        p_trusted => true,
        p_rate => 4.8
    );

    PERFORM public.upsert_sense_cache(
        p_id => 'ctx_wn_bank.n.02',
        p_meaning => 'Bờ sông, bờ đê',
        p_define => 'Sloping land (especially the slope beside a body of water).',
        p_example => 'They walked along the river bank.',
        p_pos => 'noun',
        p_ipa => '/bæŋk/',
        p_synonyms => ARRAY['riverside', 'embankment'],
        p_antonyms => ARRAY[]::TEXT[],
        p_confidence => 0.92,
        p_trusted => true,
        p_rate => 4.5
    );

    -- 2. Insert or ensure test user exists (giả lập profile sau khi login qua Google Provider)
    INSERT INTO public.users (
        id,
        username,
        name,
        email,
        display_name,
        avatar_url
    ) VALUES (
        v_user_id,
        'nguyen_van_a',
        'Nguyễn Văn A',
        'nguyenvana@example.com',
        'Nguyễn Văn A',
        'https://api.dicebear.com/7.x/bottts/svg?seed=nguyenvana'
    )
    ON CONFLICT (id) DO NOTHING;

    -- 3. Insert user_word (Từ vựng của User: từ 'bank')
    INSERT INTO public.user_words (
        user_id,
        text,
        translate_count,
        review_count,
        status
    ) VALUES (
        v_user_id,
        'bank',
        3,
        1,
        'learning'
    )
    ON CONFLICT (user_id, text) DO UPDATE SET
        translate_count = public.user_words.translate_count + 1
    RETURNING id INTO v_word_id;

    -- 4. Insert word_meaning 1: Ngân hàng
    INSERT INTO public.word_meanings (
        user_word_id,
        sense_id,
        meaning,
        context,
        define,
        example,
        pos,
        ipa,
        synonyms
    ) VALUES (
        v_word_id,
        'ctx_wn_bank.n.01',
        'Ngân hàng, định chế tài chính',
        'I went to the bank to open a savings account.',
        'A financial institution that accepts deposits.',
        'She works as a manager at the central bank.',
        'noun',
        '/bæŋk/',
        ARRAY['financial institution', 'depository']
    )
    RETURNING id INTO v_meaning1_id;

    -- 5. Insert word_meaning 2: Bờ sông
    INSERT INTO public.word_meanings (
        user_word_id,
        sense_id,
        meaning,
        context,
        define,
        example,
        pos,
        ipa,
        synonyms
    ) VALUES (
        v_word_id,
        'ctx_wn_bank.n.02',
        'Bờ sông, mép nước',
        'We set up our camping tent near the river bank.',
        'Sloping land beside a body of water.',
        'The water flooded over the grassy bank.',
        'noun',
        '/bæŋk/',
        ARRAY['riverbank', 'shore']
    )
    RETURNING id INTO v_meaning2_id;

    -- Lưu ý: Trigger trg_auto_create_flashcard_stat đã TỰ ĐỘNG tạo flashcard_statistics
    -- cho cả 2 meaning trên! Chúng ta cập nhật một số điểm test:
    UPDATE public.flashcard_statistics
    SET chose_true_count = 2,
        fill_true_count = 1,
        write_fail_count = 1,
        success_count = 3,
        review_count = 4,
        hard_score = 2.40
    WHERE word_meaning_id = v_meaning1_id;

    -- 6. Ghi nhận tương tác từ vựng (gặp từ & dịch từ)
    PERFORM public.record_word_interaction(v_user_id, 'bank', true, 'web');
    PERFORM public.record_word_interaction(v_user_id, 'bank', false, 'extension');

    RAISE NOTICE 'Seed data inserted successfully for user: %', v_user_id;
END;
$$;
