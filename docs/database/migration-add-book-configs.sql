-- =============================================
-- Migration: Add book_configs table
-- Date: 2026-03-17
-- Purpose: Store immutable published book_config snapshots for runtime lookup
-- Safety: Idempotent; safe to rerun
-- =============================================

-- Ensure the shared updated_at trigger function exists.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS book_configs (
    id BIGSERIAL PRIMARY KEY,
    book_id VARCHAR(120) NOT NULL,
    version INTEGER NOT NULL,
    schema VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    default_format_id VARCHAR(80) NOT NULL,
    config_json JSONB NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    published_at TIMESTAMP DEFAULT NOW(),
    published_by VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE book_configs ENABLE ROW LEVEL SECURITY;

ALTER TABLE book_configs
    ALTER COLUMN book_id SET NOT NULL,
    ALTER COLUMN version SET NOT NULL,
    ALTER COLUMN schema SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN default_format_id SET NOT NULL,
    ALTER COLUMN config_json SET NOT NULL,
    ALTER COLUMN checksum SET NOT NULL,
    ALTER COLUMN is_active SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE book_configs
    DROP CONSTRAINT IF EXISTS book_configs_version_positive,
    DROP CONSTRAINT IF EXISTS book_configs_status_valid,
    DROP CONSTRAINT IF EXISTS book_configs_checksum_sha256,
    DROP CONSTRAINT IF EXISTS book_configs_config_json_object,
    DROP CONSTRAINT IF EXISTS book_configs_identity_matches_payload;

ALTER TABLE book_configs
    ADD CONSTRAINT book_configs_version_positive CHECK (version > 0),
    ADD CONSTRAINT book_configs_status_valid CHECK (status IN ('draft', 'active', 'archived')),
    ADD CONSTRAINT book_configs_checksum_sha256 CHECK (checksum ~ '^[a-f0-9]{64}$'),
    ADD CONSTRAINT book_configs_config_json_object CHECK (jsonb_typeof(config_json) = 'object'),
    ADD CONSTRAINT book_configs_identity_matches_payload CHECK (
        config_json ? 'bookId'
        AND config_json ? 'version'
        AND config_json ? 'schema'
        AND config_json ? 'status'
        AND config_json ? 'defaultFormatId'
        AND book_id = config_json->>'bookId'
        AND version = (config_json->>'version')::integer
        AND schema = config_json->>'schema'
        AND status = config_json->>'status'
        AND default_format_id = config_json->>'defaultFormatId'
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_book_configs_book_version
    ON book_configs(book_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_book_configs_one_active_per_book
    ON book_configs(book_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_book_configs_status
    ON book_configs(status);

CREATE INDEX IF NOT EXISTS idx_book_configs_published_at
    ON book_configs(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_book_configs_checksum
    ON book_configs(checksum);

COMMENT ON TABLE book_configs IS 'Immutable published book configuration snapshots for runtime lookup.';
COMMENT ON COLUMN book_configs.book_id IS 'Canonical runtime book identifier, for example book-mvp-simple-adventure.';
COMMENT ON COLUMN book_configs.version IS 'Version of the authored book config snapshot.';
COMMENT ON COLUMN book_configs.schema IS 'Schema version of the config payload, for example lhb.book-config@v1.';
COMMENT ON COLUMN book_configs.status IS 'Lifecycle of the published config snapshot: draft, active, archived.';
COMMENT ON COLUMN book_configs.default_format_id IS 'Default format_id from the published config payload.';
COMMENT ON COLUMN book_configs.config_json IS 'Full validated book config snapshot as published from the repo.';
COMMENT ON COLUMN book_configs.checksum IS 'SHA-256 checksum of the canonicalized config_json payload.';
COMMENT ON COLUMN book_configs.published_at IS 'Timestamp when this config snapshot was first published.';
COMMENT ON COLUMN book_configs.published_by IS 'Actor or tool that published this snapshot.';
COMMENT ON COLUMN book_configs.is_active IS 'Marks the default production snapshot for a given book_id.';

DROP TRIGGER IF EXISTS update_book_configs_updated_at ON book_configs;
CREATE TRIGGER update_book_configs_updated_at
    BEFORE UPDATE ON book_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
