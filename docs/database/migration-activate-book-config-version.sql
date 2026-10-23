-- Activate an approved, checksum-pinned snapshot in one transaction.
-- Apply before deploying the publisher that calls the four-argument RPC.
DROP FUNCTION IF EXISTS public.activate_book_config_version(text, integer, text);
DROP FUNCTION IF EXISTS public.activate_book_config_version(text, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.activate_book_config_version(
    p_book_id text,
    p_version integer,
    p_checksum text,
    p_expected_config_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    target public.book_configs%ROWTYPE;
BEGIN
    IF p_book_id IS NULL OR btrim(p_book_id) = ''
       OR p_version IS NULL OR p_version <= 0
       OR p_checksum IS NULL OR p_checksum !~ '^[a-f0-9]{64}$'
       OR p_expected_config_json IS NULL
       OR jsonb_typeof(p_expected_config_json) <> 'object' THEN
        RAISE EXCEPTION 'Book config activation requires book, version, checksum and expected JSON';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_book_id));
    SELECT * INTO target
      FROM public.book_configs
     WHERE book_id = p_book_id
       AND version = p_version
     FOR UPDATE;
    IF NOT FOUND OR target.checksum <> p_checksum THEN
        RAISE EXCEPTION 'Book config activation target is missing or checksum differs';
    END IF;
    IF target.status IS DISTINCT FROM 'active'
       OR target.config_json->>'status' IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Book config activation requires an active published snapshot';
    END IF;
    IF target.config_json IS DISTINCT FROM p_expected_config_json
       OR p_expected_config_json->>'bookId' IS DISTINCT FROM p_book_id
       OR p_expected_config_json->>'version' IS DISTINCT FROM p_version::text THEN
        RAISE EXCEPTION 'Book config activation JSON does not match the approved snapshot';
    END IF;

    UPDATE public.book_configs
       SET is_active = false, updated_at = now()
     WHERE book_id = p_book_id
       AND version <> p_version
       AND is_active = true;

    UPDATE public.book_configs
       SET is_active = true, updated_at = now()
     WHERE book_id = p_book_id
       AND version = p_version;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_book_config_version(text, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_book_config_version(text, integer, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_book_config_version(text, integer, text, jsonb) TO service_role;
