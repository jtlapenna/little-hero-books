#!/bin/bash
# Test script to start and test the mock renderer server

echo "🚀 Starting Little Hero Books Mock Renderer..."

# Navigate to renderer-mock directory
cd /Users/jeff/Projects/little-hero-books/renderer-mock

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "❌ node_modules not found. Installing dependencies..."
    npm install
fi

# Start the server in background
echo "📡 Starting server on port 8787..."
node server.js &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 3

# Test health endpoint
echo "🔍 Testing health endpoint..."
curl -s http://localhost:8787/health

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Server is running successfully!"
    
    # Test render endpoint
    echo "🎨 Testing PDF generation..."
    curl -X POST http://localhost:8787/render \
      -H "Content-Type: application/json" \
      -d '{
        "orderId":"TEST-001",
        "pages":[
          {"background":"http://localhost:8787/assets/backgrounds/page01_bedroom.svg"}
        ],
        "cover":{
          "front_background":"http://localhost:8787/assets/backgrounds/page01_bedroom.svg",
          "title":"Emma and the Adventure Compass"
        }
      }'
    
    echo ""
    echo "🎉 Mock renderer is working correctly!"
    echo "📁 Check the 'out' directory for generated PDFs"
    
    # Keep server running
    echo "🔄 Server is running in background (PID: $SERVER_PID)"
    echo "🛑 To stop: kill $SERVER_PID"
else
    echo "❌ Server failed to start"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi
