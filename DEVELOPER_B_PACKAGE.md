# Developer B Package: Database Setup for Little Hero Books

## Overview
This package provides complete instructions for setting up the database infrastructure for the Human-in-the-Loop Asset Review System. The database will replace the current file-based approval store and provide persistent storage for orders, approvals, and audit trails.

## Prerequisites
- Access to a PostgreSQL database (local or cloud)
- Database administration privileges
- Basic understanding of SQL and database concepts

## Database Requirements

### 1. Database Server
- **Type**: PostgreSQL 13+ (recommended: PostgreSQL 15+)
- **Storage**: Minimum 10GB (recommended: 50GB+ for production)
- **Memory**: Minimum 2GB RAM (recommended: 8GB+ for production)
- **Backup**: Automated daily backups recommended

### 2. Connection Details
You'll need these connection parameters:
- Host (e.g., `localhost` or cloud provider endpoint)
- Port (default: `5432`)
- Database name (e.g., `little_hero_books`)
- Username and password
- SSL mode (required for cloud providers)

## Setup Instructions

### Step 1: Create Database and User

#### Option A: Using psql (Command Line)
```sql
-- Connect to PostgreSQL as superuser
psql -U postgres

-- Create database
CREATE DATABASE little_hero_books;

-- Create user
CREATE USER lhb_user WITH PASSWORD 'your_secure_password_here';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE little_hero_books TO lhb_user;

-- Connect to the new database
\c little_hero_books

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO lhb_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO lhb_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lhb_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO lhb_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO lhb_user;
```

#### Option B: Using pgAdmin (GUI)
1. Open pgAdmin
2. Right-click "Databases" → "Create" → "Database"
3. Name: `little_hero_books`
4. Right-click "Login/Group Roles" → "Create" → "Login/Group Role"
5. Name: `lhb_user`, Password: `your_secure_password_here`
6. Go to "Privileges" tab, grant "Can login" and "Superuser" (or specific permissions)

### Step 2: Run Database Schema

Execute the following SQL script to create all required tables:

```sql
-- Connect to little_hero_books database
\c little_hero_books

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(255) UNIQUE NOT NULL,
    platform VARCHAR(50) NOT NULL,
    amazon_order_id VARCHAR(255),
    project VARCHAR(100) NOT NULL,
    customer_first_name VARCHAR(100) NOT NULL,
    customer_last_name VARCHAR(100) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    order_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) NOT NULL,
    ai_generation_started_at TIMESTAMP WITH TIME ZONE,
    character_hash VARCHAR(100),
    character_path VARCHAR(500),
    template_path VARCHAR(500),
  character_specs JSONB,
    book_specs JSONB,
    order_details JSONB,
    asset_prefix VARCHAR(500),
    webhooks JSONB,
    r2_assets JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Review stages table
CREATE TABLE review_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(255) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    stage_name VARCHAR(50) NOT NULL, -- 'preBria', 'postBria', 'postPdf'
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'in_review', 'approved', 'rejected'
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_email VARCHAR(255),
    reviewer_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(order_id, stage_name)
);

-- Approvals table (replaces file-based approval store)
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(255) NOT NULL,
    stage VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved'
    approved_at TIMESTAMP WITH TIME ZONE,
    reviewer_email VARCHAR(255) NOT NULL,
    reviewer_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(order_id, stage)
);

-- Audit trail table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL, -- 'stage_approved', 'stage_rejected', 'asset_replaced', etc.
    stage VARCHAR(50),
    reviewer_email VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Error logs table
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_id VARCHAR(100) UNIQUE NOT NULL,
    error_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    user_id VARCHAR(255),
    request_id VARCHAR(100),
    user_agent TEXT,
    ip_address INET,
    stack_trace TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_orders_order_id ON orders(order_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_character_hash ON orders(character_hash);
CREATE INDEX idx_orders_order_date ON orders(order_date);
CREATE INDEX idx_orders_customer_email ON orders(customer_email);

CREATE INDEX idx_review_stages_order_id ON review_stages(order_id);
CREATE INDEX idx_review_stages_stage_name ON review_stages(stage_name);
CREATE INDEX idx_review_stages_status ON review_stages(status);

CREATE INDEX idx_approvals_order_id ON approvals(order_id);
CREATE INDEX idx_approvals_stage ON approvals(stage);
CREATE INDEX idx_approvals_status ON approvals(status);

CREATE INDEX idx_audit_logs_order_id ON audit_logs(order_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

CREATE INDEX idx_error_logs_error_type ON error_logs(error_type);
CREATE INDEX idx_error_logs_severity ON error_logs(severity);
CREATE INDEX idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX idx_error_logs_created_at ON error_logs(created_at);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_review_stages_updated_at BEFORE UPDATE ON review_stages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON approvals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Step 3: Environment Configuration

Create a `.env.local` file in the back-end directory with your database credentials:

```bash
# Database Configuration
DB_HOST=your_database_host
DB_PORT=5432
DB_NAME=little_hero_books
DB_USER=lhb_user
DB_PASSWORD=your_secure_password_here
DB_SSL=true

# For production, also set:
# DB_SCHEMA=public
# DB_POOL_MIN=2
# DB_POOL_MAX=10
# DB_POOL_IDLE_TIMEOUT=30000
```

### Step 4: Install Database Dependencies

Add the required packages to your back-end project:

```bash
cd /Users/jeff/Projects/little-hero-books/back-end
npm install pg @types/pg
```

### Step 5: Database Connection Setup

Create a database connection module:

```typescript
// src/lib/database.ts
import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
});

export { pool };

export async function query(text: string, params?: any[]): Promise<any> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}
```

### Step 6: Migration Scripts

Create migration scripts to handle database updates:

```typescript
// src/lib/migrations.ts
import { query } from './database';

export async function runMigrations() {
  console.log('Running database migrations...');
  
  // Check if migrations table exists
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Add your migration logic here
  // Example: Check if a column exists before adding it
  
  console.log('Migrations completed');
}
```

### Step 7: Update Approval Store

Replace the file-based approval store with database operations:

```typescript
// src/lib/approval-store-db.ts
import { query } from './database';

export async function approveStage(
  orderId: string, 
  stage: string, 
  reviewer: string = 'system@littleherolabs.com'
): Promise<any> {
  const result = await query(`
    INSERT INTO approvals (order_id, stage, status, approved_at, reviewer_email)
    VALUES ($1, $2, 'approved', NOW(), $3)
    ON CONFLICT (order_id, stage) 
    DO UPDATE SET 
      status = 'approved',
      approved_at = NOW(),
      reviewer_email = $3,
      updated_at = NOW()
    RETURNING *
  `, [orderId, stage, reviewer]);

  return result.rows[0];
}

export async function getStageStatus(orderId: string, stage: string): Promise<'approved' | 'pending'> {
  const result = await query(`
    SELECT status FROM approvals 
    WHERE order_id = $1 AND stage = $2
  `, [orderId, stage]);

  return result.rows[0]?.status || 'pending';
}
```

## Testing the Setup

### 1. Connection Test
```bash
# Test database connection
psql -h your_host -U lhb_user -d little_hero_books -c "SELECT version();"
```

### 2. Application Test
```typescript
// Test in your application
import { query } from './lib/database';

async function testConnection() {
  try {
    const result = await query('SELECT NOW() as current_time');
    console.log('Database connected:', result.rows[0]);
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}
```

## Production Considerations

### 1. Security
- Use strong passwords
- Enable SSL/TLS connections
- Restrict database access by IP
- Regular security updates

### 2. Performance
- Monitor query performance
- Add indexes as needed
- Consider read replicas for heavy read workloads
- Regular VACUUM and ANALYZE

### 3. Backup Strategy
```bash
# Daily backup script
pg_dump -h your_host -U lhb_user -d little_hero_books > backup_$(date +%Y%m%d).sql

# Restore from backup
psql -h your_host -U lhb_user -d little_hero_books < backup_20250117.sql
```

### 4. Monitoring
- Set up database monitoring
- Monitor connection pool usage
- Track slow queries
- Alert on disk space usage

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check host and port
   - Verify firewall settings
   - Ensure PostgreSQL is running

2. **Authentication Failed**
   - Verify username and password
   - Check pg_hba.conf configuration
   - Ensure user has proper permissions

3. **SSL Errors**
   - Set `DB_SSL=false` for local development
   - For production, ensure proper SSL certificates

4. **Permission Denied**
   - Grant proper privileges to the user
   - Check schema permissions
   - Verify table ownership

### Useful Queries

```sql
-- Check active connections
SELECT * FROM pg_stat_activity WHERE datname = 'little_hero_books';

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables WHERE schemaname = 'public';

-- Check recent errors
SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 10;

-- Check approval status
SELECT order_id, stage, status, approved_at, reviewer_email 
FROM approvals ORDER BY approved_at DESC LIMIT 10;
```

## Next Steps

After completing this setup:

1. Update the application to use the database instead of file-based storage
2. Implement the database service layer
3. Add database integration to the monitoring system
4. Set up automated backups
5. Configure production monitoring and alerting

This database setup provides a solid foundation for the Human-in-the-Loop Asset Review System with proper data persistence, audit trails, and error tracking.