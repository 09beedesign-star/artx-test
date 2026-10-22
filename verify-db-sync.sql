-- SQL script to verify manual credit grant sync
-- This directly tests the database sync mechanism

DO $$
DECLARE
    v_test_user_id text := '7f143112-0b9e-45a3-a808-f83a44295101';
    v_auth_data jsonb;
    v_admin_data jsonb;
    v_user_credits_before int;
    v_user_credits_after int;
    v_batch_credits int;
    v_batch_count int;
BEGIN
    -- Get initial balance from auth-users
    SELECT data INTO v_auth_data FROM artx_json_documents WHERE key = 'auth-users';
    
    SELECT (elem->>'credits')::int INTO v_user_credits_before
    FROM jsonb_array_elements(v_auth_data->'users') elem
    WHERE elem->>'id' = v_test_user_id;
    
    RAISE NOTICE 'Initial balance in auth-users: %', v_user_credits_before;
    
    -- Get batch totals from admin-data
    SELECT data INTO v_admin_data FROM artx_json_documents WHERE key = 'admin-data';
    
    SELECT 
        COUNT(*),
        COALESCE(SUM((elem->>'remainingCredits')::int), 0)
    INTO v_batch_count, v_batch_credits
    FROM jsonb_array_elements(v_admin_data->'creditBatches') elem
    WHERE elem->>'userId' = v_test_user_id;
    
    RAISE NOTICE 'Credit batches: % batches, % total credits', v_batch_count, v_batch_credits;
    
    -- Verify sync
    IF v_user_credits_before = v_batch_credits THEN
        RAISE NOTICE '✅ PASS: auth-users balance matches credit batches';
    ELSE
        RAISE NOTICE '❌ FAIL: auth-users balance (%) does not match credit batches (%)', 
            v_user_credits_before, v_batch_credits;
    END IF;
    
    -- Show recent credit entries
    RAISE NOTICE '';
    RAISE NOTICE 'Recent credit ledger entries:';
    PERFORM jsonb_pretty(elem)
    FROM (
        SELECT elem, (elem->>'createdAt')::timestamp as created
        FROM jsonb_array_elements(v_admin_data->'credits') elem
        WHERE elem->>'userId' = v_test_user_id
        ORDER BY created DESC
        LIMIT 3
    ) sub;
    
END $$;
