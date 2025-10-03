#!/bin/bash
# Little Hero Books Database Setup Script

set -e  # Exit on any error

echo "🚀 Setting up Little Hero Books Database..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed. Please install it first:${NC}"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    echo "  CentOS: sudo yum install postgresql postgresql-server"
    exit 1
fi

# Check if PostgreSQL is running
if ! pg_isready -q; then
    echo -e "${YELLOW}⚠️  PostgreSQL is not running. Starting it...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew services start postgresql
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo systemctl start postgresql
    fi
    sleep 2
fi

# Database configuration
DB_NAME="little_hero_books"
DB_USER="${DB_USER:-$(whoami)}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo -e "${BLUE}📋 Database Configuration:${NC}"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo ""

# Create database if it doesn't exist
echo -e "${BLUE}🗄️  Creating database...${NC}"
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${YELLOW}⚠️  Database '$DB_NAME' already exists.${NC}"
    read -p "Do you want to drop and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🗑️  Dropping existing database...${NC}"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "DROP DATABASE IF EXISTS $DB_NAME;"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;"
    else
        echo -e "${YELLOW}⚠️  Skipping database creation.${NC}"
    fi
else
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;"
    echo -e "${GREEN}✅ Database '$DB_NAME' created successfully.${NC}"
fi

# Run schema creation
echo -e "${BLUE}📊 Creating database schema...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f schema.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database schema created successfully.${NC}"
else
    echo -e "${RED}❌ Failed to create database schema.${NC}"
    exit 1
fi

# Test database connection
echo -e "${BLUE}🔍 Testing database connection...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 'Database connection successful!' as status;"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database connection test passed.${NC}"
else
    echo -e "${RED}❌ Database connection test failed.${NC}"
    exit 1
fi

# Show database summary
echo -e "${BLUE}📈 Database Summary:${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
SELECT 
    schemaname,
    tablename,
    attname as column_name,
    typname as data_type
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_attribute a ON a.attrelid = c.oid
JOIN pg_type ty ON ty.oid = a.atttypid
WHERE schemaname = 'public' 
AND a.attnum > 0 
AND NOT a.attisdropped
ORDER BY tablename, a.attnum;
"

echo -e "${GREEN}🎉 Database setup completed successfully!${NC}"
echo ""
echo -e "${BLUE}📝 Next Steps:${NC}"
echo "1. Update your .env file with database credentials:"
echo "   DB_HOST=$DB_HOST"
echo "   DB_PORT=$DB_PORT"
echo "   DB_NAME=$DB_NAME"
echo "   DB_USER=$DB_USER"
echo "   DB_PASSWORD=your_password"
echo ""
echo "2. Configure n8n PostgreSQL credentials"
echo "3. Import your n8n workflows"
echo "4. Test the workflows"
echo ""
echo -e "${BLUE}🔧 Useful Commands:${NC}"
echo "  Connect to database: psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
echo "  View tables: \dt"
echo "  View order summary: SELECT * FROM order_summary;"
echo "  View failed orders: SELECT * FROM failed_orders_summary;"
