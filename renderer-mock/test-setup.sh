#!/bin/bash
# Test setup script for mock renderer

echo "🚀 Setting up Little Hero Books Mock Renderer..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this from the renderer-mock directory."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create out directory
echo "📁 Creating output directory..."
mkdir -p out

# Test the server
echo "🧪 Testing server startup..."
timeout 5s node server.js &
SERVER_PID=$!

sleep 2

# Test health endpoint
echo "🔍 Testing health endpoint..."
curl -s http://localhost:8787/health

if [ $? -eq 0 ]; then
    echo "✅ Server is running and responding"
else
    echo "❌ Server health check failed"
fi

# Kill the test server
kill $SERVER_PID 2>/dev/null

echo "🎉 Setup complete! Run 'node server.js' to start the mock renderer."
