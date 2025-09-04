#!/bin/bash

# Deploy Database Export to Ubuntu Server
# Usage: ./deploy-to-server.sh <server_ip> <username>

if [ $# -ne 2 ]; then
    echo "Usage: $0 <server_ip> <username>"
    echo "Example: $0 192.168.1.100 ubuntu"
    exit 1
fi

SERVER_IP=$1
USERNAME=$2
PROJECT_DIR="MicroLearning"

echo "🚀 Deploying database export to server $SERVER_IP..."

# Check if export file exists
if [ ! -f "database-export.json" ]; then
    echo "❌ Error: database-export.json not found!"
    echo "Please run 'node export-database.js' first to create the export."
    exit 1
fi

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf database-export.tar.gz \
    database-export.json \
    restore-database.js \
    package.json \
    .env.example \
    dbsetup.js

# Copy to server
echo "📤 Copying files to server..."
scp database-export.tar.gz $USERNAME@$SERVER_IP:~/

# Execute deployment commands on server
echo "🔧 Setting up database on server..."
ssh $USERNAME@$SERVER_IP << 'EOF'
    echo "📁 Extracting files..."
    tar -xzf database-export.tar.gz
    
    echo "📋 Installing dependencies..."
    npm install
    
    echo "🗄️ Setting up database..."
    node dbsetup.js
    
    echo "🔄 Restoring data..."
    node restore-database.js
    
    echo "🧹 Cleaning up..."
    rm database-export.tar.gz
    
    echo "✅ Deployment completed!"
EOF

# Clean up local files
echo "🧹 Cleaning up local files..."
rm database-export.tar.gz

echo "🎉 Deployment completed successfully!"
echo "Your database is now running on $SERVER_IP:3000"
