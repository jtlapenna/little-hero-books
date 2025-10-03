# Little Hero Books Database Setup

This directory contains the database schema and setup scripts for the Little Hero Books n8n automation system.

## 🗄️ Database Overview

**Database Type**: PostgreSQL  
**Purpose**: Order tracking, error management, and workflow audit trails  
**Tables**: 4 main tables + views and functions

### Tables

1. **`orders`** - Primary order tracking
2. **`failed_orders`** - Error tracking and retry management  
3. **`order_processing_log`** - Detailed audit trail
4. **`system_config`** - System configuration settings

## 🚀 Quick Setup

### Prerequisites

- PostgreSQL installed and running
- `psql` command line tool available

### Installation

1. **Run the setup script**:
   ```bash
   cd database
   ./setup.sh
   ```

2. **Configure environment variables**:
   ```bash
   cp env.example .env
   # Edit .env with your database credentials
   ```

3. **Verify installation**:
   ```bash
   psql -h localhost -U your_username -d little_hero_books -c "SELECT * FROM order_summary;"
   ```

## 📊 Database Schema

### Orders Table
Primary table for tracking all book orders through the pipeline.

**Key Fields**:
- `orderId` - Unique order identifier
- `amazonOrderId` - Amazon's order ID
- `childName` - Child's name for personalization
- `status` - Current order status
- `podOrderId` - Print-on-demand order ID
- `bookPdfUrl` - Generated book PDF URL
- `trackingNumber` - Shipping tracking number

### Failed Orders Table
Tracks failed orders and manages retry logic.

**Key Fields**:
- `orderId` - Reference to orders table
- `error_type` - Type of error (amazon, renderer, pod, tracking)
- `retry_count` - Number of retry attempts
- `next_retry_at` - When to retry next
- `status` - Current retry status

### Order Processing Log
Detailed audit trail for all workflow steps.

**Key Fields**:
- `orderId` - Reference to orders table
- `workflow_name` - Which workflow (flow_a, flow_b, flow_c)
- `step_name` - Specific step within workflow
- `status` - Step execution status
- `duration_ms` - Step execution time

## 🔧 Configuration

### Environment Variables

```bash
# Database Connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=little_hero_books
DB_USER=your_username
DB_PASSWORD=your_password
DB_SSL=false

# n8n Database Credentials
N8N_DB_HOST=localhost
N8N_DB_PORT=5432
N8N_DB_NAME=little_hero_books
N8N_DB_USER=your_username
N8N_DB_PASSWORD=your_password
N8N_DB_SSL=false
```

### n8n Configuration

In n8n, create a PostgreSQL credential with:
- **Host**: `{{ $vars.N8N_DB_HOST }}`
- **Port**: `{{ $vars.N8N_DB_PORT }}`
- **Database**: `{{ $vars.N8N_DB_NAME }}`
- **Username**: `{{ $vars.N8N_DB_USER }}`
- **Password**: `{{ $vars.N8N_DB_PASSWORD }}`
- **SSL**: `{{ $vars.N8N_DB_SSL }}`

## 📈 Monitoring & Analytics

### Built-in Views

1. **`order_summary`** - Daily order statistics
2. **`failed_orders_summary`** - Error type breakdown

### Useful Queries

```sql
-- Daily order summary
SELECT * FROM order_summary ORDER BY order_date DESC LIMIT 7;

-- Failed orders by type
SELECT * FROM failed_orders_summary;

-- Orders currently processing
SELECT orderId, childName, status, createdAt 
FROM orders 
WHERE status IN ('submitted', 'in_production')
ORDER BY createdAt DESC;

-- Recent errors
SELECT orderId, error_type, error_message, createdAt
FROM failed_orders 
WHERE status = 'failed'
ORDER BY createdAt DESC
LIMIT 10;
```

## 🔄 Workflow Integration

### Flow A (Order Intake)
- **INSERT** into `orders` when order processed
- **INSERT** into `order_processing_log` for each step

### Flow B (Tracking)
- **SELECT** from `orders` for in-flight orders
- **UPDATE** `orders` with tracking information
- **INSERT** into `order_processing_log` for tracking steps

### Flow C (Exception Handling)
- **SELECT** from `failed_orders` for retry candidates
- **UPDATE** `failed_orders` with retry attempts
- **INSERT** into `order_processing_log` for retry steps

## 🛠️ Maintenance

### Regular Tasks

1. **Clean up old logs** (optional):
   ```sql
   DELETE FROM order_processing_log 
   WHERE createdAt < NOW() - INTERVAL '30 days';
   ```

2. **Archive completed orders** (optional):
   ```sql
   -- Move old completed orders to archive table
   -- (Implement based on your retention policy)
   ```

3. **Monitor performance**:
   ```sql
   -- Check slow queries
   SELECT query, mean_time, calls 
   FROM pg_stat_statements 
   ORDER BY mean_time DESC;
   ```

### Backup

```bash
# Create backup
pg_dump -h localhost -U your_username little_hero_books > backup_$(date +%Y%m%d).sql

# Restore backup
psql -h localhost -U your_username little_hero_books < backup_20240101.sql
```

## 🚨 Troubleshooting

### Common Issues

1. **Connection refused**:
   - Check if PostgreSQL is running
   - Verify host/port settings
   - Check firewall settings

2. **Permission denied**:
   - Verify user has database access
   - Check user permissions

3. **Schema errors**:
   - Re-run schema.sql
   - Check for conflicting objects

### Debug Commands

```bash
# Test connection
psql -h localhost -U your_username -d little_hero_books -c "SELECT version();"

# Check tables
psql -h localhost -U your_username -d little_hero_books -c "\dt"

# Check indexes
psql -h localhost -U your_username -d little_hero_books -c "\di"
```

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [n8n PostgreSQL Node](https://docs.n8n.io/integrations/builtin/cluster-nodes/n8n-nodes-base.postgres/)
- [Database Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
