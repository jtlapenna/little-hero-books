-- =============================================
-- Migration: Add workflow job-control tables
-- Date: 2026-03-24
-- Purpose: Store durable backend workflow job state, attempts, and run events
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

CREATE TABLE IF NOT EXISTS workflow_jobs (
    id BIGSERIAL PRIMARY KEY,
    job_type VARCHAR(120) NOT NULL,
    stage VARCHAR(80) NOT NULL,
    order_row_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    order_id VARCHAR(120),
    root_order_id VARCHAR(120),
    amazon_order_id VARCHAR(120),
    book_id VARCHAR(120),
    logical_key VARCHAR(160) NOT NULL DEFAULT 'default',
    idempotency_key VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    lease_owner VARCHAR(255),
    lease_expires_at TIMESTAMP,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMP,
    external_provider VARCHAR(80),
    external_request_id VARCHAR(255),
    external_status_url TEXT,
    input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    normalized_input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_error JSONB,
    queued_at TIMESTAMP NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMP,
    started_at TIMESTAMP,
    polling_at TIMESTAMP,
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    dead_lettered_at TIMESTAMP,
    canceled_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_job_attempts (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES workflow_jobs(id) ON DELETE CASCADE,
    attempt INTEGER NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'claimed',
    worker_kind VARCHAR(80),
    lease_owner VARCHAR(255),
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP,
    duration_ms INTEGER,
    error_message TEXT,
    error_details JSONB,
    provider_request_id VARCHAR(255),
    provider_status_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_job_events (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES workflow_jobs(id) ON DELETE CASCADE,
    attempt_id BIGINT REFERENCES workflow_job_attempts(id) ON DELETE SET NULL,
    event_type VARCHAR(120) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE workflow_jobs
    ALTER COLUMN job_type SET NOT NULL,
    ALTER COLUMN stage SET NOT NULL,
    ALTER COLUMN logical_key SET NOT NULL,
    ALTER COLUMN idempotency_key SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN attempt_count SET NOT NULL,
    ALTER COLUMN max_attempts SET NOT NULL,
    ALTER COLUMN input_snapshot SET NOT NULL,
    ALTER COLUMN normalized_input_snapshot SET NOT NULL,
    ALTER COLUMN result_snapshot SET NOT NULL,
    ALTER COLUMN queued_at SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE workflow_job_attempts
    ALTER COLUMN job_id SET NOT NULL,
    ALTER COLUMN attempt SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN started_at SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE workflow_job_events
    ALTER COLUMN job_id SET NOT NULL,
    ALTER COLUMN event_type SET NOT NULL,
    ALTER COLUMN payload SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workflow_jobs_status_valid'
    ) THEN
        ALTER TABLE workflow_jobs
            ADD CONSTRAINT workflow_jobs_status_valid
            CHECK (
                status IN (
                    'queued',
                    'claimed',
                    'running',
                    'polling',
                    'retry_waiting',
                    'succeeded',
                    'failed',
                    'dead_lettered',
                    'canceled'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workflow_jobs_attempt_count_nonnegative'
    ) THEN
        ALTER TABLE workflow_jobs
            ADD CONSTRAINT workflow_jobs_attempt_count_nonnegative
            CHECK (attempt_count >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workflow_jobs_max_attempts_positive'
    ) THEN
        ALTER TABLE workflow_jobs
            ADD CONSTRAINT workflow_jobs_max_attempts_positive
            CHECK (max_attempts > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workflow_job_attempts_status_valid'
    ) THEN
        ALTER TABLE workflow_job_attempts
            ADD CONSTRAINT workflow_job_attempts_status_valid
            CHECK (
                status IN (
                    'claimed',
                    'running',
                    'polling',
                    'succeeded',
                    'failed',
                    'canceled'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workflow_job_attempts_attempt_positive'
    ) THEN
        ALTER TABLE workflow_job_attempts
            ADD CONSTRAINT workflow_job_attempts_attempt_positive
            CHECK (attempt > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workflow_job_attempts_duration_nonnegative'
    ) THEN
        ALTER TABLE workflow_job_attempts
            ADD CONSTRAINT workflow_job_attempts_duration_nonnegative
            CHECK (duration_ms IS NULL OR duration_ms >= 0);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_jobs_idempotency_key
    ON workflow_jobs(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_status_next_retry
    ON workflow_jobs(status, next_retry_at, created_at)
    WHERE status IN ('queued', 'retry_waiting');

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_status_lease
    ON workflow_jobs(status, lease_expires_at, updated_at)
    WHERE status IN ('claimed', 'running', 'polling');

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_order_id
    ON workflow_jobs(order_id);

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_root_order_id
    ON workflow_jobs(root_order_id);

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_amazon_order_id
    ON workflow_jobs(amazon_order_id);

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_job_type_stage
    ON workflow_jobs(job_type, stage, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_external_request
    ON workflow_jobs(external_provider, external_request_id);

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_created_at
    ON workflow_jobs(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_job_attempts_job_attempt
    ON workflow_job_attempts(job_id, attempt);

CREATE INDEX IF NOT EXISTS idx_workflow_job_attempts_status_started
    ON workflow_job_attempts(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_job_events_job_created
    ON workflow_job_events(job_id, created_at DESC);

COMMENT ON TABLE workflow_jobs IS 'Durable job-control rows for repo-owned workflow execution.';
COMMENT ON COLUMN workflow_jobs.job_type IS 'Logical worker family, for example w2a-pose or w3-assembly.';
COMMENT ON COLUMN workflow_jobs.stage IS 'Pipeline stage name, for example 2a, 2b, 3, or 4.1.';
COMMENT ON COLUMN workflow_jobs.order_row_id IS 'Resolved integer orders.id row when available.';
COMMENT ON COLUMN workflow_jobs.logical_key IS 'Stable per-order logical item key such as pose-07 or sibling-2.';
COMMENT ON COLUMN workflow_jobs.idempotency_key IS 'Stable dedupe key used to prevent duplicate job creation.';
COMMENT ON COLUMN workflow_jobs.status IS 'Job lifecycle state for queueing, claims, polling, completion, or dead-letter.';
COMMENT ON COLUMN workflow_jobs.lease_owner IS 'Worker instance that currently owns the lease for this job.';
COMMENT ON COLUMN workflow_jobs.lease_expires_at IS 'Lease expiration timestamp used to reclaim stalled work safely.';
COMMENT ON COLUMN workflow_jobs.input_snapshot IS 'Original enqueue payload snapshot for replay and debugging.';
COMMENT ON COLUMN workflow_jobs.normalized_input_snapshot IS 'Normalized backend-owned payload snapshot used by the worker.';
COMMENT ON COLUMN workflow_jobs.result_snapshot IS 'Most recent durable result payload or completion summary.';
COMMENT ON COLUMN workflow_jobs.last_error IS 'Structured final or last-seen error payload.';

COMMENT ON TABLE workflow_job_attempts IS 'Execution attempts for each workflow job.';
COMMENT ON COLUMN workflow_job_attempts.worker_kind IS 'Worker implementation or execution surface, for example n8n, repo-worker, or cron.';
COMMENT ON COLUMN workflow_job_attempts.provider_request_id IS 'Provider-side request id captured during the attempt.';
COMMENT ON COLUMN workflow_job_attempts.provider_status_url IS 'Provider-side polling/status URL captured during the attempt.';

COMMENT ON TABLE workflow_job_events IS 'Append-only debug and state-transition breadcrumbs for workflow jobs.';
COMMENT ON COLUMN workflow_job_events.event_type IS 'Short event code such as queued, claim-conflict, provider-submitted, or replay-requested.';

DROP TRIGGER IF EXISTS update_workflow_jobs_updated_at ON workflow_jobs;
CREATE TRIGGER update_workflow_jobs_updated_at
    BEFORE UPDATE ON workflow_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_job_attempts_updated_at ON workflow_job_attempts;
CREATE TRIGGER update_workflow_job_attempts_updated_at
    BEFORE UPDATE ON workflow_job_attempts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
