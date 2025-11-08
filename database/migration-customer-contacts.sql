-- Customer Contacts table for hybrid preview workflow
-- Stores customer email/name captured from preview page contact form

CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(50) NOT NULL,
  amazon_order_id VARCHAR(50),
  token VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(150),
  reason VARCHAR(50),
  payload JSONB,
  message TEXT,
  revision_requested BOOLEAN DEFAULT FALSE,
  revision_count INTEGER DEFAULT 0,
  marketing_opt_in BOOLEAN DEFAULT FALSE,
  last_contacted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_order_id ON customer_contacts(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_amazon_order_id ON customer_contacts(amazon_order_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_email ON customer_contacts(email);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_reason ON customer_contacts(reason);

