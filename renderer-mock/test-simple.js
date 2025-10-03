const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Serve static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Serve test HTML
app.get('/test', (req, res) => {
  const htmlPath = path.join(__dirname, 'test-html.html');
  res.sendFile(htmlPath);
});

// Simple test endpoint
app.post('/test-render', (req, res) => {
  const { pages = [] } = req.body || {};
  
  console.log('📄 Test render request received:');
  pages.forEach((page, index) => {
    console.log(`  Page ${index + 1}: ${page.background}`);
    if (page.text) {
      console.log(`    Text: ${page.text.content.substring(0, 50)}...`);
    }
    if (page.character) {
      console.log(`    Character: ${page.character.image}`);
    }
  });
  
  res.json({
    success: true,
    message: 'Test render completed - check console for details',
    pages: pages.length
  });
});

const PORT = process.env.PORT || 8788;
app.listen(PORT, () => {
  console.log(`🚀 Test server running on http://localhost:${PORT}`);
  console.log(`📄 Test page: http://localhost:${PORT}/test`);
  console.log(`🔍 Test render: POST http://localhost:${PORT}/test-render`);
});
