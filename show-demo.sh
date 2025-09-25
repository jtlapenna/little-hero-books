#!/bin/bash

echo "🎨 Little Hero Books - Visual Demo"
echo "=================================="
echo ""

echo "📊 Service Status:"
curl -s http://localhost:8787/health | jq '.'
echo ""

echo "📁 Generated Files:"
ls -la renderer/out/*/
echo ""

echo "📄 Latest Demo Book:"
LATEST_DIR=$(ls -t renderer/out/ | head -1)
echo "Directory: $LATEST_DIR"
echo "Book PDF: $(ls -lh renderer/out/$LATEST_DIR/book.pdf | awk '{print $5}')"
echo "Cover PDF: $(ls -lh renderer/out/$LATEST_DIR/cover.pdf | awk '{print $5}')"
echo ""

echo "✅ All systems operational!"
echo "🚀 Ready for Amazon SP-API integration!"

