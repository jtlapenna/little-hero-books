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
  
  // Default to page01 if no specific page requested
  if (filePath === './') {
    filePath = './page01-test.html';
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
  console.log('🎨 Character Positioning Test Server');
  console.log(`📡 Server running at http://localhost:${PORT}`);
  console.log('\n📋 Available test pages:');
  console.log(`   http://localhost:${PORT}/page01-test.html - Garden Path Twilight`);
  console.log(`   http://localhost:${PORT}/page02-test.html - Garden Gate Magical`);
  console.log(`   http://localhost:${PORT}/page03-test.html - Forest Night`);
  console.log(`   http://localhost:${PORT}/page04-test.html - Forest Clearing`);
  console.log(`   http://localhost:${PORT}/pose-gallery.html - Character Poses Gallery`);
  console.log('\n🎯 Instructions:');
  console.log('1. Open each page in your browser');
  console.log('2. Use the position controls to adjust character placement');
  console.log('3. Click "Copy CSS" to get the exact positioning values');
  console.log('4. Update the n8n workflow with the final positions');
  console.log('\nPress Ctrl+C to stop the server');
});
