# Supabase Database Setup for Little Hero Books

## 🎯 Why Supabase?

- **Already in your ecosystem** - No new platform to learn
- **Real-time capabilities** - Perfect for order tracking updates
- **Team collaboration** - Easy project sharing
- **PostgreSQL compatibility** - Works with n8n out of the box
- **Free tier** - Generous limits for MVP
- **Automatic backups** - Built-in data protection

## 🚀 Quick Setup Steps

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose your organization
4. Project name: `little-hero-books`
5. Database password: Generate a strong password
6. Region: Choose closest to your users

### 2. Get Database Credentials

In your Supabase project dashboard:

1. Go to **Settings** → **Database**
2. Copy the connection details:
   - **Host**: `db.your-project-ref.supabase.co`
   - **Port**: `5432`
   - **Database**: `postgres`
   - **Username**: `postgres`
   - **Password**: Your generated password

### 3. Run Database Schema

#### Option A: Using Supabase SQL Editor (Recommended)

1. Go to **SQL Editor** in your Supabase dashboard
2. Copy the contents of `schema.sql`
3. Paste and run the SQL
4. Verify tables were created in **Table Editor**

#### Option B: Using psql Command Line

```bash
# Install psql if needed
brew install postgresql  # macOS
# or
sudo apt-get install postgresql-client  # Ubuntu

# Connect and run schema
psql -h db.your-project-ref.supabase.co -p 5432 -U postgres -d postgres -f schema.sql
```

### 4. Configure Environment Variables

Create `.env` file in your project root:

```bash
# Supabase Database Configuration
DB_HOST=db.your-project-ref.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your-generated-password
DB_SSL=true

# n8n Database Credentials
N8N_DB_HOST=db.your-project-ref.supabase.co
N8N_DB_PORT=5432
N8N_DB_NAME=postgres
N8N_DB_USER=postgres
N8N_DB_PASSWORD=your-generated-password
N8N_DB_SSL=true

# Supabase Project Details
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 5. Test Database Connection

```bash
# Test connection
psql -h db.your-project-ref.supabase.co -p 5432 -U postgres -d postgres -c "SELECT 'Supabase connection successful!' as status;"

# Test tables
psql -h db.your-project-ref.supabase.co -p 5432 -U postgres -d postgres -c "\dt"
```

## 🔧 n8n Configuration

### 1. Create PostgreSQL Credential in n8n

1. Go to **Credentials** in n8n
2. Click **Add Credential**
3. Select **PostgreSQL**
4. Fill in the details:
   - **Host**: `{{ $vars.N8N_DB_HOST }}`
   - **Port**: `{{ $vars.N8N_DB_PORT }}`
   - **Database**: `{{ $vars.N8N_DB_NAME }}`
   - **Username**: `{{ $vars.N8N_DB_USER }}`
   - **Password**: `{{ $vars.N8N_DB_PASSWORD }}`
   - **SSL**: `{{ $vars.N8N_DB_SSL }}`

### 2. Test Database Connection

Create a simple test workflow:
1. **Manual Trigger** → **PostgreSQL** → **Execute Query**
2. Query: `SELECT 'n8n connection successful!' as status;`
3. Run the workflow to test

## 📊 Supabase Dashboard Features

### 1. Table Editor
- View and edit data directly
- Real-time updates
- Built-in data validation

### 2. SQL Editor
- Run custom queries
- Save frequently used queries
- Query history

### 3. Database Settings
- Connection pooling
- Performance monitoring
- Backup management

### 4. Real-time Subscriptions
- Subscribe to table changes
- Perfect for order status updates
- Can integrate with your frontend later

## 🔒 Security Best Practices

### 1. Row Level Security (RLS)
```sql
-- Enable RLS on orders table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create policy for service role
CREATE POLICY "Service role can manage orders" ON orders
FOR ALL USING (auth.role() = 'service_role');
```

### 2. API Keys
- **Anon Key**: For public operations (if needed)
- **Service Role Key**: For n8n workflows (keep secret)
- **Database Password**: For direct database access

### 3. Environment Variables
- Never commit `.env` files
- Use different keys for different environments
- Rotate keys regularly

## 📈 Monitoring & Analytics

### 1. Supabase Dashboard
- **Database** → **Logs**: Query performance
- **Database** → **Metrics**: Connection stats
- **Database** → **Backups**: Automatic backups

### 2. Custom Queries
```sql
-- Order processing rate
SELECT 
    DATE(createdAt) as date,
    COUNT(*) as orders,
    AVG(EXTRACT(EPOCH FROM (updatedAt - createdAt))/60) as avg_processing_minutes
FROM orders 
GROUP BY DATE(createdAt)
ORDER BY date DESC;

-- Error rate by type
SELECT 
    error_type,
    COUNT(*) as error_count,
    AVG(retry_count) as avg_retries
FROM failed_orders 
GROUP BY error_type
ORDER BY error_count DESC;
```

## 🚀 Advanced Features (Future)

### 1. Real-time Subscriptions
```javascript
// Subscribe to order status changes
const subscription = supabase
  .channel('order-updates')
  .on('postgres_changes', 
    { event: 'UPDATE', schema: 'public', table: 'orders' },
    (payload) => {
      console.log('Order updated:', payload.new);
    }
  )
  .subscribe();
```

### 2. Edge Functions
- Host your renderer service
- Process orders server-side
- Integrate with external APIs

### 3. Authentication
- Customer login (future feature)
- Admin dashboard access
- API key management

## 🛠️ Troubleshooting

### Common Issues

1. **Connection refused**:
   - Check if project is paused (free tier)
   - Verify credentials
   - Check firewall settings

2. **SSL errors**:
   - Ensure `DB_SSL=true`
   - Check certificate validity

3. **Permission denied**:
   - Verify service role key
   - Check RLS policies

### Debug Commands

```bash
# Test connection
psql -h db.your-project-ref.supabase.co -p 5432 -U postgres -d postgres -c "SELECT version();"

# Check connection pool
psql -h db.your-project-ref.supabase.co -p 5432 -U postgres -d postgres -c "SELECT * FROM pg_stat_activity;"
```

## 📚 Next Steps

1. **Set up Supabase project** using this guide
2. **Configure n8n credentials** with Supabase details
3. **Import your workflows** into n8n
4. **Test database integration** with sample data
5. **Set up monitoring** and alerts

## 💡 Pro Tips

- **Use connection pooling** for better performance
- **Enable real-time** for order tracking updates
- **Set up alerts** for failed orders
- **Monitor usage** to stay within free tier limits
- **Use Supabase CLI** for schema migrations

---

**Ready to get started?** Follow the steps above and you'll have a production-ready database setup in minutes!
