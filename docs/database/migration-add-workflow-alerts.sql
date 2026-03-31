-- =============================================
-- Migration: Add workflow alerts table
-- Date: 2026-03-30
-- Purpose: Store durable admin-visible alerts for repo-centric workflow jobs
-- Safety: Idempotent; safe to rerun
-- =============================================

CREATE TABLE IF NOT EXISTS workflow_alerts (
    id BIGSERIAL PRIMARY KEY,
    dedupe_key VARCHAR(255) NOT NULL,
    job_id BIGINT REFERENCES workflow_jobs(id) ON DELETE CASCADE,
    attempt_id BIGINT REFERENCES workflow_job_attempts(id) ON DELETE SET NULL,
    stage VARCHAR(80),
    alert_type VARCHAR(120) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'warning',
    status VARCHAR(24) NOT NULL DEFAULT 'open',
    summary TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR(255),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE workflow_alerts
    ALTER COLUMN dedupe_key SET NOT NULL,
    ALTER COLUMN alert_type SET NOT NULL,
    ALTER COLUMN severity SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN summary SET NOT NULL,
    ALTER COLUMN details SET NOT NULL,
    ALTER COLUMN first_seen_at SET NOT NULL,
    ALTER COLUMN last_seen_at SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workflow_alerts_severity_valid'
    ) THEN
        ALTER TABLE workflow_alerts
            ADD CONSTRAINT workflow_alerts_severity_valid
            CHECK (severity IN ('info', 'warning', 'critical'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workflow_alerts_status_valid'
    ) THEN
        ALTER TABLE workflow_alerts
            ADD CONSTRAINT workflow_alerts_status_valid
            CHECK (status IN ('open', 'acknowledged', 'resolved'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_alerts_dedupe_key
    ON workflow_alerts(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_workflow_alerts_status_stage
    ON workflow_alerts(status, stage, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_alerts_job_id
    ON workflow_alerts(job_id);

CREATE INDEX IF NOT EXISTS idx_workflow_alerts_attempt_id
    ON workflow_alerts(attempt_id);

CREATE INDEX IF NOT EXISTS idx_workflow_alerts_last_seen_at
    ON workflow_alerts(last_seen_at DESC);

COMMENT ON TABLE workflow_alerts IS 'Durable operator-visible alerts derived from repo-centric workflow job health.';
COMMENT ON COLUMN workflow_alerts.dedupe_key IS 'Stable key so repeated watchdog passes update one alert instead of creating duplicates.';
COMMENT ON COLUMN workflow_alerts.details IS 'Structured alert context such as correlation ids, provider status, and timing data.';

DROP TRIGGER IF EXISTS update_workflow_alerts_updated_at ON workflow_alerts;
CREATE TRIGGER update_workflow_alerts_updated_at
    BEFORE UPDATE ON workflow_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
