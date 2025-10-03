const express = require('express');
const path = require('path');

const app = express();

// Serve static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Serve pages directory
app.use('/', express.static(path.join(__dirname, 'pages')));

const PORT = 8789;
app.listen(PORT, () => {
  console.log(`🎨 Page Development Server running on http://localhost:${PORT}`);
  console.log(`📄 Page Index: http://localhost:${PORT}/`);
  console.log(`📄 Page 02 Test: http://localhost:${PORT}/page02-test.html`);
});
