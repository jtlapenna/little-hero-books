-- Little Hero Books - Complete Database Schema
-- Supabase PostgreSQL Database
-- Created for n8n workflow integration

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- MAIN ORDERS TABLE
-- =============================================
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    amazon_order_id VARCHAR(50) UNIQUE NOT NULL,
    processing_id VARCHAR(100) UNIQUE,
    
    -- Order Status & Workflow Tracking
    status VARCHAR(50) DEFAULT 'pending_validation',
    workflow_step VARCHAR(50) DEFAULT 'order_intake',
    next_workflow VARCHAR(50),
    
    -- Amazon Order Data
    order_status VARCHAR(20),
    purchase_date TIMESTAMP,
    order_total DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    marketplace_id VARCHAR(20),
    
    -- Customer Information
    customer_email VARCHAR(255),
    customer_name VARCHAR(255),
    shipping_address JSONB,
    
    -- Character Specifications
    character_specs JSONB,
    character_hash VARCHAR(16),
    
    -- Product Information
    product_info JSONB,
    
    -- Processing Metadata
    priority VARCHAR(20) DEFAULT 'normal',
    estimated_processing_time VARCHAR(50),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    queued_at TIMESTAMP,
    validated_at TIMESTAMP,
    
    -- Validation & Quality
    validation_errors JSONB DEFAULT '[]',
    quality_score DECIMAL(3,2),
    requires_human_review BOOLEAN DEFAULT FALSE,
    human_approved BOOLEAN DEFAULT NULL,
    human_reviewed_at TIMESTAMP,
    human_reviewer VARCHAR(100),
    qa_notes TEXT,
    
    -- Regeneration & Feedback System
    regeneration_attempt INTEGER DEFAULT 0,
    regeneration_instructions TEXT,
    quality_issues JSONB DEFAULT '[]',
    previous_character_images JSONB DEFAULT '[]',
    rejection_history JSONB DEFAULT '[]',
    
    -- File URLs & Storage
    final_book_url TEXT,
    cover_image_url TEXT,
    thumbnail_url TEXT,
    
    -- Print & Fulfillment
    lulu_job_id VARCHAR(100),
    lulu_status VARCHAR(50),
    print_submitted_at TIMESTAMP,
    tracking_number VARCHAR(100),
    carrier VARCHAR(50),
    shipped_at TIMESTAMP,
    
    -- Cost Tracking
    ai_generation_cost DECIMAL(10,2) DEFAULT 0.00,
    print_cost DECIMAL(10,2) DEFAULT 0.00,
    total_cost DECIMAL(10,2) DEFAULT 0.00
);

-- =============================================
-- CHARACTER GENERATIONS TABLE
-- =============================================
CREATE TABLE character_generations (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    pose_number INTEGER NOT NULL,
    
    -- Generation Status
    status VARCHAR(50) DEFAULT 'pending',
    bria_request_id VARCHAR(100),
    bria_status_url TEXT,
    
    -- Image URLs
    original_image_url TEXT,
    processed_image_url TEXT,
    background_removed_url TEXT,
    final_image_url TEXT,
    
    -- Quality Metrics
    quality_score DECIMAL(3,2),
    consistency_score DECIMAL(3,2),
    character_match_score DECIMAL(3,2),
    
    -- Processing Metadata
    generation_attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    generation_started_at TIMESTAMP,
    generation_completed_at TIMESTAMP,
    
    -- Cost Tracking
    generation_cost DECIMAL(10,2) DEFAULT 0.00,
    
    UNIQUE(order_id, pose_number)
);

-- =============================================
-- FAILED ORDERS TABLE
-- =============================================
CREATE TABLE failed_orders (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Error Classification
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSONB,
    workflow_step VARCHAR(50),
    
    -- Retry Logic
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP,
    retry_strategy VARCHAR(50),
    
    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100),
    
    -- Timestamps
    failed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- AUDIT LOGS TABLE
-- =============================================
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Action Details
    action VARCHAR(100) NOT NULL,
    workflow_step VARCHAR(50),
    details JSONB,
    
    -- User/System Info
    performed_by VARCHAR(100),
    system_component VARCHAR(50),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- HUMAN REVIEW QUEUE TABLE
-- =============================================
CREATE TABLE human_review_queue (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Review Details
    review_type VARCHAR(50) NOT NULL, -- 'quality_check', 'manual_approval', 'error_resolution'
    review_priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    review_reason TEXT,
    
    -- Review Status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'approved', 'rejected', 'escalated'
    assigned_to VARCHAR(100),
    reviewed_by VARCHAR(100),
    
    -- Review Data
    review_data JSONB,
    review_notes TEXT,
    decision VARCHAR(50), -- 'approve', 'reject', 'escalate', 'needs_changes'
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    assigned_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    expires_at TIMESTAMP
);

-- =============================================
-- WORKFLOW EXECUTION LOGS TABLE
-- =============================================
CREATE TABLE workflow_execution_logs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Execution Details
    workflow_name VARCHAR(100) NOT NULL,
    execution_id VARCHAR(100),
    node_name VARCHAR(100),
    
    -- Status & Results
    status VARCHAR(50) NOT NULL, -- 'success', 'error', 'warning'
    execution_time_ms INTEGER,
    error_message TEXT,
    
    -- Data
    input_data JSONB,
    output_data JSONB,
    
    -- Timestamps
    started_at TIMESTAMP,
    completed_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Orders table indexes
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_amazon_order_id ON orders(amazon_order_id);
CREATE INDEX idx_orders_character_hash ON orders(character_hash);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_next_workflow ON orders(next_workflow);
CREATE INDEX idx_orders_requires_human_review ON orders(requires_human_review);
CREATE INDEX idx_orders_human_approved ON orders(human_approved);

-- Character generations indexes
CREATE INDEX idx_character_generations_order_id ON character_generations(order_id);
CREATE INDEX idx_character_generations_status ON character_generations(status);
CREATE INDEX idx_character_generations_bria_request_id ON character_generations(bria_request_id);

-- Failed orders indexes
CREATE INDEX idx_failed_orders_order_id ON failed_orders(order_id);
CREATE INDEX idx_failed_orders_error_type ON failed_orders(error_type);
CREATE INDEX idx_failed_orders_retry_count ON failed_orders(retry_count);
CREATE INDEX idx_failed_orders_next_retry_at ON failed_orders(next_retry_at);
CREATE INDEX idx_failed_orders_resolved ON failed_orders(resolved);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_order_id ON audit_logs(order_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Human review queue indexes
CREATE INDEX idx_human_review_queue_order_id ON human_review_queue(order_id);
CREATE INDEX idx_human_review_queue_status ON human_review_queue(status);
CREATE INDEX idx_human_review_queue_priority ON human_review_queue(review_priority);
CREATE INDEX idx_human_review_queue_assigned_to ON human_review_queue(assigned_to);

-- Workflow execution logs indexes
CREATE INDEX idx_workflow_execution_logs_order_id ON workflow_execution_logs(order_id);
CREATE INDEX idx_workflow_execution_logs_workflow_name ON workflow_execution_logs(workflow_name);
CREATE INDEX idx_workflow_execution_logs_status ON workflow_execution_logs(status);

-- =============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_character_generations_updated_at BEFORE UPDATE ON character_generations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_failed_orders_updated_at BEFORE UPDATE ON failed_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SAMPLE DATA FOR TESTING
-- =============================================

-- Insert sample orders
INSERT INTO orders (
    amazon_order_id, processing_id, status, workflow_step, next_workflow,
    order_status, purchase_date, order_total, customer_email, customer_name,
    shipping_address, character_specs, character_hash, product_info,
    priority, estimated_processing_time, created_at
) VALUES 
(
    'TEST-ORDER-001', 'order_TEST-ORDER-001_1760500029498', 'queued_for_processing', 'order_intake', '2.A.-bria-submit',
    'Unshipped', NOW() - INTERVAL '1 hour', 29.99, 'jane.smith@example.com', 'Jane Smith',
    '{"Name": "Jane Smith", "AddressLine1": "123 Main Street", "City": "Portland", "StateOrRegion": "OR", "PostalCode": "97201", "CountryCode": "US"}',
    '{"childName": "Emma", "skinTone": "medium", "hairColor": "brown", "hairStyle": "short/curly", "age": "5", "pronouns": "she/her", "favoriteColor": "purple", "animalGuide": "unicorn", "clothingStyle": "dress"}',
    '21c9b5ba',
    '{"asin": "B0LITTLEHERO001", "sku": "LITTLE_HERO_BOOK_CUSTOM", "title": "Little Hero Book - Emma''s Adventure", "quantity": 1}',
    'normal', '30-45 minutes', NOW() - INTERVAL '1 hour'
),
(
    'TEST-ORDER-002', 'order_TEST-ORDER-002_1760500029499', 'queued_for_processing', 'order_intake', '2.A.-bria-submit',
    'Unshipped', NOW() - INTERVAL '30 minutes', 29.99, 'mike.johnson@example.com', 'Mike Johnson',
    '{"Name": "Mike Johnson", "AddressLine1": "456 Oak Avenue", "City": "Seattle", "StateOrRegion": "WA", "PostalCode": "98101", "CountryCode": "US"}',
    '{"childName": "Alex", "skinTone": "light", "hairColor": "blonde", "hairStyle": "medium/straight", "age": "4", "pronouns": "he/him", "favoriteColor": "blue", "animalGuide": "dog", "clothingStyle": "t-shirt and shorts"}',
    '8f2a1c3e',
    '{"asin": "B0LITTLEHERO001", "sku": "LITTLE_HERO_BOOK_CUSTOM", "title": "Little Hero Book - Alex''s Adventure", "quantity": 1}',
    'normal', '30-45 minutes', NOW() - INTERVAL '30 minutes'
);

-- Insert sample character generations
INSERT INTO character_generations (order_id, pose_number, status, created_at)
SELECT o.id, pose_num, 'pending', NOW()
FROM orders o
CROSS JOIN generate_series(1, 12) AS pose_num
WHERE o.amazon_order_id IN ('TEST-ORDER-001', 'TEST-ORDER-002');

-- Insert sample audit log
INSERT INTO audit_logs (order_id, action, workflow_step, details, performed_by, system_component)
SELECT id, 'order_created', 'order_intake', 
       '{"source": "amazon_sp_api", "validation_status": "passed"}',
       'system', 'workflow_1'
FROM orders 
WHERE amazon_order_id IN ('TEST-ORDER-001', 'TEST-ORDER-002');

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- View for orders ready for next workflow
CREATE VIEW orders_ready_for_workflow AS
SELECT 
    o.*,
    CASE 
        WHEN o.status = 'queued_for_processing' AND o.next_workflow = '2.A.-bria-submit' THEN true
        WHEN o.status = 'ai_generation_completed' AND o.next_workflow = '3-book-assembly' THEN true
        WHEN o.status = 'book_assembly_completed' AND o.requires_human_review = false AND o.human_approved = true THEN true
        ELSE false
    END as ready_for_next_workflow
FROM orders o
WHERE o.status IN ('queued_for_processing', 'ai_generation_completed', 'book_assembly_completed');

-- View for human review queue
CREATE VIEW pending_human_reviews AS
SELECT 
    o.amazon_order_id,
    o.customer_name,
    o.character_specs,
    hrq.*,
    o.created_at as order_created_at,
    o.updated_at as order_updated_at
FROM human_review_queue hrq
JOIN orders o ON hrq.order_id = o.id
WHERE hrq.status = 'pending'
ORDER BY hrq.review_priority DESC, hrq.created_at ASC;

-- View for workflow status dashboard
CREATE VIEW workflow_status_dashboard AS
SELECT 
    workflow_step,
    status,
    COUNT(*) as order_count,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60) as avg_processing_time_minutes
FROM orders 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY workflow_step, status
ORDER BY workflow_step, status;
