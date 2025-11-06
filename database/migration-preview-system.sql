-- Migration: Customer Preview & Approval System
-- Date: 2025-11-05
-- Description: Adds tables and columns for customer preview, approval, and feedback system

-- Add revision_count to orders table
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;

-- Create preview_tokens table
CREATE TABLE IF NOT EXISTS preview_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(50) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) DEFAULT 'system'
);

-- Create customer_feedback table
CREATE TABLE IF NOT EXISTS customer_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(50) NOT NULL,
  page_number INTEGER NOT NULL,
  issue_type VARCHAR(50) NOT NULL CHECK (issue_type IN ('image', 'text', 'character', 'other')),
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'dismissed')),
  revision_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- Create indexes for preview_tokens
CREATE INDEX IF NOT EXISTS idx_preview_tokens_token ON preview_tokens(token);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_order_id ON preview_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_expires_at ON preview_tokens(expires_at);

-- Create indexes for customer_feedback
CREATE INDEX IF NOT EXISTS idx_customer_feedback_order_id ON customer_feedback(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_status ON customer_feedback(status);

-- Create notification_logs table (track all notification attempts)
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(50) NOT NULL,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('email', 'amazon_message', 'sms')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
  recipient VARCHAR(255) NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for notification_logs
CREATE INDEX IF NOT EXISTS idx_notification_logs_order_id ON notification_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);

-- Add comment for documentation
COMMENT ON TABLE preview_tokens IS 'Secure tokens for customer preview links. Tokens expire after 14 days and are single-use.';
COMMENT ON TABLE customer_feedback IS 'Customer feedback and issue flags for book revisions. Tracks revision requests and resolution status.';
COMMENT ON TABLE notification_logs IS 'Tracks all notification attempts (email, Amazon Message Center, SMS) for preview links. Used for reliability and debugging.';
COMMENT ON COLUMN orders.revision_count IS 'Number of revision requests made by customer. Used to enforce revision limits.';

