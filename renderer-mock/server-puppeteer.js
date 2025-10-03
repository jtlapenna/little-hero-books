const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { mkdirp } = require('mkdirp');
const Handlebars = require('handlebars');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Serve static assets and generated outputs
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/out', express.static(path.join(__dirname, 'out')));

// Load HTML templates
const baseTemplate = fs.readFileSync(path.join(__dirname, 'templates', 'base.html'), 'utf8');
const coverTemplate = fs.readFileSync(path.join(__dirname, 'templates', 'cover.html'), 'utf8');

// Compile Handlebars templates
const baseTemplateCompiled = Handlebars.compile(baseTemplate);
const coverTemplateCompiled = Handlebars.compile(coverTemplate);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /render - New Puppeteer-based renderer
app.post('/render', async (req, res) => {
  try {
    const { orderId = `DEV-${Date.now()}`, pages = [], cover = {} } = req.body || {};
    if (!pages.length) return res.status(400).json({ error: 'No pages provided' });

    console.log(`🎨 Rendering order ${orderId} with ${pages.length} pages using Puppeteer`);

    const outDir = path.join(__dirname, 'out', orderId);
    await mkdirp(outDir);

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set viewport to match our page size
    await page.setViewport({
      width: 1350, // 11.25in * 120 DPI for screen preview
      height: 1050, // 8.75in * 120 DPI for screen preview
      deviceScaleFactor: 1
    });

    // Generate book pages
    const bookPages = [];
    for (let i = 0; i < pages.length; i++) {
      const pageData = pages[i];
      console.log(`  📄 Generating page ${i + 1}: ${pageData.background}`);
      
      // Prepare template data
      const templateData = {
        backgroundImage: pageData.background,
        text: pageData.text ? {
          content: pageData.text.content,
          position: pageData.text.position || 'left',
          align: pageData.text.align || 'left'
        } : null,
        character: pageData.character ? {
          image: pageData.character.image,
          position: pageData.character.position || 'right'
        } : null
      };

      // Render HTML
      const html = baseTemplateCompiled(templateData);
      
      // Set content and generate PDF
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        width: '11.25in',
        height: '8.75in',
        printBackground: true,
        margin: {
          top: '0in',
          right: '0in',
          bottom: '0in',
          left: '0in'
        }
      });

      bookPages.push(pdfBuffer);
    }

    // Generate cover
    let coverPdf = null;
    if (cover.front_background) {
      console.log(`  📖 Generating cover: ${cover.front_background}`);
      
      const coverData = {
        backgroundImage: cover.front_background,
        title: cover.title || 'Adventure Book',
        subtitle: 'A Personalized Story'
      };

      const coverHtml = coverTemplateCompiled(coverData);
      await page.setContent(coverHtml, { waitUntil: 'networkidle0' });
      
      coverPdf = await page.pdf({
        width: '11.25in',
        height: '8.75in',
        printBackground: true,
        margin: {
          top: '0in',
          right: '0in',
          bottom: '0in',
          left: '0in'
        }
      });
    }

    await browser.close();

    // Save individual PDFs
    const bookPath = path.join(outDir, 'book.pdf');
    const coverPath = path.join(outDir, 'cover.pdf');

    // Combine all book pages into one PDF
    const PDFDocument = require('pdf-lib').PDFDocument;
    const mergedPdf = await PDFDocument.create();
    
    for (const pageBuffer of bookPages) {
      const pdf = await PDFDocument.load(pageBuffer);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }
    
    const bookPdfBytes = await mergedPdf.save();
    fs.writeFileSync(bookPath, bookPdfBytes);

    // Save cover
    if (coverPdf) {
      fs.writeFileSync(coverPath, coverPdf);
    }

    console.log(`✅ Order ${orderId} rendered successfully!`);
    console.log(`   Book: http://localhost:8787/out/${orderId}/book.pdf`);
    if (coverPdf) {
      console.log(`   Cover: http://localhost:8787/out/${orderId}/cover.pdf`);
    }

    res.json({
      success: true,
      orderId,
      bookUrl: `http://localhost:8787/out/${orderId}/book.pdf`,
      coverUrl: coverPdf ? `http://localhost:8787/out/${orderId}/cover.pdf` : null
    });

  } catch (error) {
    console.error('❌ Render error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`🚀 Little Hero Books Puppeteer Renderer running on http://localhost:${PORT}`);
  console.log(`📁 Background images: http://localhost:${PORT}/assets/backgrounds`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`📄 Render endpoint: POST http://localhost:${PORT}/render`);
});
