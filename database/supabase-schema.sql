-- Little Hero Books Database Schema for Supabase
-- Optimized for Supabase PostgreSQL with RLS and real-time features

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Orders table - Primary order tracking
CREATE TABLE orders (
    orderId VARCHAR(50) PRIMARY KEY,
    amazonOrderId VARCHAR(50),
    childName VARCHAR(100) NOT NULL,
    childAge INTEGER CHECK (childAge >= 0 AND childAge <= 10),
    childHair VARCHAR(20),
    childSkin VARCHAR(20),
    childPronouns VARCHAR(20),
    favoriteAnimal VARCHAR(50),
    favoriteFood VARCHAR(50),
    favoriteColor VARCHAR(20),
    hometown VARCHAR(100),
    occasion VARCHAR(50),
    dedication TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_processing',
    podOrderId VARCHAR(50),
    bookPdfUrl TEXT,
    coverPdfUrl TEXT,
    thumbUrl TEXT,
    trackingNumber VARCHAR(100),
    carrier VARCHAR(50),
    trackingUrl TEXT,
    estimatedDelivery TIMESTAMP,
    shippedAt TIMESTAMP,
    -- Shipping information
    shippingName VARCHAR(100),
    shippingAddress1 VARCHAR(200),
    shippingAddress2 VARCHAR(200),
    shippingCity VARCHAR(100),
    shippingState VARCHAR(50),
    shippingZip VARCHAR(20),
    shippingCountry VARCHAR(10) DEFAULT 'US',
    shippingPhone VARCHAR(20),
    shippingEmail VARCHAR(100),
    -- Timestamps
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Failed orders table - Error tracking and retry management
CREATE TABLE failed_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orderId VARCHAR(50) NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT,
    error_location VARCHAR(100), -- 'amazon', 'renderer', 'pod', 'tracking'
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMP,
    next_retry_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'failed',
    original_data JSONB,
    retry_strategy VARCHAR(50), -- 'exponential_backoff', 'linear', 'immediate'
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100), -- 'system', 'manual', 'admin'
    resolution_notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orderId) REFERENCES orders(orderId) ON DELETE CASCADE
);

-- Order processing log - Detailed audit trail
CREATE TABLE order_processing_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orderId VARCHAR(50) NOT NULL,
    workflow_name VARCHAR(50) NOT NULL, -- 'flow_a', 'flow_b', 'flow_c'
    step_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed', 'skipped'
    message TEXT,
    data JSONB,
    duration_ms INTEGER,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orderId) REFERENCES orders(orderId) ON DELETE CASCADE
);

-- System configuration table
CREATE TABLE system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_podOrderId ON orders(podOrderId);
CREATE INDEX idx_orders_amazonOrderId ON orders(amazonOrderId);
CREATE INDEX idx_orders_createdAt ON orders(createdAt);
CREATE INDEX idx_orders_updatedAt ON orders(updatedAt);

CREATE INDEX idx_failed_orders_status ON failed_orders(status);
CREATE INDEX idx_failed_orders_next_retry ON failed_orders(next_retry_at);
CREATE INDEX idx_failed_orders_orderId ON failed_orders(orderId);
CREATE INDEX idx_failed_orders_error_type ON failed_orders(error_type);
CREATE INDEX idx_failed_orders_createdAt ON failed_orders(createdAt);

CREATE INDEX idx_processing_log_orderId ON order_processing_log(orderId);
CREATE INDEX idx_processing_log_workflow ON order_processing_log(workflow_name);
CREATE INDEX idx_processing_log_createdAt ON order_processing_log(createdAt);

-- Add check constraints for data validation
ALTER TABLE orders ADD CONSTRAINT chk_orders_status 
CHECK (status IN ('pending_processing', 'submitted', 'in_production', 'shipped', 'failed', 'cancelled'));

ALTER TABLE failed_orders ADD CONSTRAINT chk_failed_orders_status 
CHECK (status IN ('failed', 'retrying', 'resolved', 'dead_letter', 'manual_review', 'cancelled'));

ALTER TABLE order_processing_log ADD CONSTRAINT chk_processing_log_status 
CHECK (status IN ('started', 'completed', 'failed', 'skipped', 'retrying'));

-- Create function to automatically update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updatedAt = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_failed_orders_updated_at BEFORE UPDATE ON failed_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default system configuration
INSERT INTO system_config (key, value, description) VALUES
('max_retry_attempts', '3', 'Maximum number of retry attempts for failed orders'),
('retry_base_delay_minutes', '5', 'Base delay in minutes for retry attempts'),
('retry_max_delay_minutes', '60', 'Maximum delay in minutes for retry attempts'),
('workflow_timeout_minutes', '30', 'Timeout in minutes for workflow execution'),
('notification_webhook_url', '', 'Slack webhook URL for notifications'),
('pod_provider', 'lulu', 'Print-on-demand provider (lulu, onpress, etc.)'),
('storage_provider', 'cloudflare_r2', 'File storage provider (cloudflare_r2, aws_s3)'),
('environment', 'development', 'Environment (development, staging, production)');

-- Create views for common queries
CREATE VIEW order_summary AS
SELECT 
    DATE(createdAt) as order_date,
    COUNT(*) as total_orders,
    SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped_orders,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_orders,
    SUM(CASE WHEN status IN ('submitted', 'in_production') THEN 1 ELSE 0 END) as processing_orders
FROM orders 
GROUP BY DATE(createdAt)
ORDER BY order_date DESC;

CREATE VIEW failed_orders_summary AS
SELECT 
    error_type,
    COUNT(*) as error_count,
    AVG(retry_count) as avg_retry_count,
    MAX(createdAt) as last_occurrence
FROM failed_orders 
WHERE status != 'resolved'
GROUP BY error_type
ORDER BY error_count DESC;

-- Enable Row Level Security (RLS)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_processing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for service role access
CREATE POLICY "Service role can manage orders" ON orders
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage failed_orders" ON failed_orders
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage processing_log" ON order_processing_log
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage system_config" ON system_config
FOR ALL USING (auth.role() = 'service_role');

-- Enable real-time subscriptions for order updates
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE failed_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_processing_log;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;

-- Grant read access to views for authenticated users
GRANT SELECT ON order_summary TO postgres, anon, authenticated, service_role;
GRANT SELECT ON failed_orders_summary TO postgres, anon, authenticated, service_role;
