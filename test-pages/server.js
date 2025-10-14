#!/usr/bin/env node

/**
 * Simple server to serve the test HTML pages
 * This allows you to open and position characters in each page
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;

const server = http.createServer((req, res) => {
  let filePath = '.' + req.url;
  
  // Default to index if no specific page requested
  if (filePath === './') {
    filePath = './index.html';
  }
  
  // Add .html extension if not present
  if (!filePath.endsWith('.html') && !filePath.includes('.')) {
    filePath += '.html';
  }
  
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
          <h1>404 - Page Not Found</h1>
          <p>Available test pages:</p>
          <ul>
            <li><a href="/page01-test.html">Page 01 - Garden Path Twilight</a></li>
            <li><a href="/page02-test.html">Page 02 - Garden Gate Magical</a></li>
            <li><a href="/page03-test.html">Page 03 - Forest Night</a></li>
            <li><a href="/page04-test.html">Page 04 - Forest Clearing</a></li>
            <li><a href="/pose-gallery.html">Character Poses Gallery</a></li>
          </ul>
        `);
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log('🌟 Little Hero Books - Character Positioning Test Server');
  console.log(`📡 Server running at http://localhost:${PORT}`);
  console.log('\n🎯 Quick Start:');
  console.log(`   Open http://localhost:${PORT}/ in your browser`);
  console.log('   Click any page card to position characters\n');
  console.log('📋 All 14 test pages available:');
  console.log('   Pages 01-14 with full positioning & lighting controls');
  console.log('   ⚠️  Page 12 needs background image (TBD)');
  console.log('   ⚠️  Page 13 uses placeholder pose\n');
  console.log('📝 Instructions:');
  console.log('1. Navigate to any page from the index');
  console.log('2. Use position controls (right %, top %, width px)');
  console.log('3. Toggle "Flip Horizontal" if needed');
  console.log('4. Adjust lighting gradient (direction, colors, opacity, blend mode)');
  console.log('5. Click "Copy CSS" to export settings');
  console.log('6. Save CSS for n8n workflow integration\n');
  console.log('Press Ctrl+C to stop the server');
});
