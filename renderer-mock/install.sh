#!/bin/bash
# Simple installation script for mock renderer

echo "🚀 Installing Little Hero Books Mock Renderer..."

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
    echo "💡 Try running: npm install"
    exit 1
fi

# Create out directory
echo "📁 Creating output directory..."
mkdir -p out

# Create test images
echo "🎨 Creating test images..."
python3 create-test-images.py

if [ $? -eq 0 ]; then
    echo "✅ Test images created successfully"
else
    echo "⚠️  Warning: Could not create test images. You may need to install Python PIL:"
    echo "   pip3 install Pillow"
fi

echo "🎉 Installation complete!"
echo ""
echo "Next steps:"
echo "1. Start the server: node server.js"
echo "2. Test health: curl http://localhost:8787/health"
echo "3. Test render: curl -X POST http://localhost:8787/render -H 'Content-Type: application/json' -d '{\"orderId\":\"TEST-001\",\"pages\":[{\"background\":\"http://localhost:8787/assets/backgrounds/page01_bedroom.png\"}],\"cover\":{\"front_background\":\"http://localhost:8787/assets/backgrounds/page01_bedroom.png\",\"title\":\"Test Book\"}}'"
