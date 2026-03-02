#!/bin/bash

# Mastra Database Setup Script
# This script helps you set up a dedicated PostgreSQL database for Mastra AI agent

echo "=========================================="
echo "Mastra AI Agent Database Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL client (psql) is not installed.${NC}"
    echo "Please install PostgreSQL client tools first."
    exit 1
fi

echo -e "${GREEN}✓${NC} PostgreSQL client found"
echo ""

# Prompt for database details
read -p "PostgreSQL host [localhost]: " DB_HOST
DB_HOST=${DB_HOST:-localhost}

read -p "PostgreSQL port [5432]: " DB_PORT
DB_PORT=${DB_PORT:-5432}

read -p "PostgreSQL admin user [postgres]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-postgres}

echo ""
read -p "Mastra database name [mastra_db]: " MASTRA_DB
MASTRA_DB=${MASTRA_DB:-mastra_db}

read -p "Mastra database user [mastra_user]: " MASTRA_USER
MASTRA_USER=${MASTRA_USER:-mastra_user}

echo ""
echo -e "${YELLOW}⚠️  You'll need to enter the PostgreSQL admin password and set a password for the Mastra user${NC}"
echo ""

# Create temporary SQL file
SQL_FILE=$(mktemp)

cat > $SQL_FILE << EOF
-- Create Mastra user
CREATE USER ${MASTRA_USER} WITH PASSWORD 'CHANGE_THIS_PASSWORD';

-- Create Mastra database
CREATE DATABASE ${MASTRA_DB}
    WITH OWNER ${MASTRA_USER}
    ENCODING 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE template0;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ${MASTRA_DB} TO ${MASTRA_USER};
EOF

echo "Creating database and user..."
echo ""

# Execute SQL as admin user
PGPASSWORD=$ADMIN_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $ADMIN_USER -f $SQL_FILE

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Database setup completed successfully!${NC}"
    echo ""
    echo "=========================================="
    echo "Add this to your .env file:"
    echo "=========================================="
    echo ""
    echo "MASTRA_DATABASE_URL=postgresql://${MASTRA_USER}:YOUR_PASSWORD@${DB_HOST}:${DB_PORT}/${MASTRA_DB}"
    echo ""
    echo -e "${YELLOW}⚠️  Important:${NC}"
    echo "1. Replace YOUR_PASSWORD with the password you set for ${MASTRA_USER}"
    echo "2. Replace 'CHANGE_THIS_PASSWORD' in the SQL if you used the SQL file directly"
    echo "3. Keep this connection string secure - don't commit to version control"
    echo ""
    echo "Mastra will automatically create necessary tables on first run:"
    echo "  - mastra_threads"
    echo "  - mastra_messages"
    echo "  - mastra_runs"
    echo "  - mastra_tool_calls"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Database setup failed.${NC}"
    echo "Please check the error messages above."
fi

# Cleanup
rm $SQL_FILE

echo ""
echo "For manual setup, see: scripts/setup-mastra-database.sql"
echo ""
