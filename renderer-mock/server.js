const express = require('express');
const fetch = require('node-fetch'); // v2
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const path = require('path');
const fs = require('fs');
const { mkdirp } = require('mkdirp');

// Custom font support without fontkit
async function loadCustomFont() {
  try {
    const fontPath = path.join(__dirname, 'assets', 'fonts', 'custom-font.ttf');
    if (fs.existsSync(fontPath)) {
      const fontData = fs.readFileSync(fontPath);
      console.log(`  ✅ Loaded custom font: ${fontPath}`);
      return fontData;
    } else {
      console.log(`  ⚠️ Custom font not found: ${fontPath}`);
      return null;
    }
  } catch (error) {
    console.log(`  ⚠️ Error loading custom font: ${error.message}`);
    return null;
  }
}

const app = express();
app.use(express.json({ limit: '10mb' }));

// Serve static assets and generated outputs
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/out', express.static(path.join(__dirname, 'out')));

const INCH = 300; // PDF points per inch (300 DPI for print quality)
const PAGE_W_IN = 11.25;  // trim 11" + 0.125" bleed each side
const PAGE_H_IN = 8.75;   // trim 8.25" + 0.25" bleed top/bottom
const PAGE_W_PT = PAGE_W_IN * INCH;
const PAGE_H_PT = PAGE_H_IN * INCH;

async function fetchAsBuffer(url) {
  // Optimize local asset fetches to avoid HTTP loopbacks and connection limits
  if (typeof url === 'string' && url.includes('/assets/')) {
    try {
      // Support both http://localhost:8787/assets/... and relative /assets/... forms
      const after = url.split('/assets/')[1];
      if (after) {
        const localPath = path.join(__dirname, 'assets', after);
        if (fs.existsSync(localPath)) {
          return fs.readFileSync(localPath);
        }
      }
    } catch {}
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// POST /render
// Minimal payload for MVP test:
// {
//   "orderId": "TEST-123",
//   "pages": [
//     {"background": "http://localhost:8787/assets/backgrounds/page01_bedroom.png", "text": "optional"},
//     {"background": "http://localhost:8787/assets/backgrounds/page02_bedroom_night.png"}
//   ],
//   "cover": {
//     "front_background": "http://localhost:8787/assets/backgrounds/page01_bedroom.png",
//     "title": "[Name] and the Adventure Compass"
//   }
// }
app.post('/render', async (req, res) => {
  try {
    const { orderId = `DEV-${Date.now()}`, pages = [], cover = {} } = req.body || {};
    if (!pages.length) return res.status(400).json({ error: 'No pages provided' });

    console.log(`🎨 Rendering order ${orderId} with ${pages.length} pages`);

    const outDir = path.join(__dirname, 'out', orderId);
    await mkdirp(outDir);

    // Build the interior (book.pdf)
    const bookPdf = await PDFDocument.create();
    
    // Load custom fonts if available, fallback to standard fonts
    let customFont, customFontBold;
    try {
      const customFontPath = path.join(__dirname, 'assets', 'fonts', 'custom-font.ttf');
      const customFontBoldPath = path.join(__dirname, 'assets', 'fonts', 'custom-font-bold.ttf');
      
      if (fs.existsSync(customFontPath)) {
        // For pdf-lib v1.17.1, we need to use the font data directly
        const fontData = fs.readFileSync(customFontPath);
        customFont = await bookPdf.embedFont(fontData);
        console.log('  ✅ Loaded custom font');
      }
      if (fs.existsSync(customFontBoldPath)) {
        const fontBoldData = fs.readFileSync(customFontBoldPath);
        customFontBold = await bookPdf.embedFont(fontBoldData);
        console.log('  ✅ Loaded custom bold font');
      }
    } catch (e) {
      console.log('  ⚠️ Custom fonts not found, using standard fonts:', e.message);
    }
    
    const helvetica = customFont || await bookPdf.embedFont(StandardFonts.Helvetica);
    const helveticaBold = customFontBold || await bookPdf.embedFont(StandardFonts.HelveticaBold);
    
    for (const p of pages) {
      const { background, text, overlays = [] } = p;
      const page = bookPdf.addPage([PAGE_W_PT, PAGE_H_PT]);

      // Draw background
      if (background) {
        console.log(`  📄 Adding page with background: ${background}`);
        const buf = await fetchAsBuffer(background);
        const ext = background.toLowerCase().endsWith('.jpg') || background.toLowerCase().endsWith('.jpeg') ? 'jpg' : 
                   background.toLowerCase().endsWith('.svg') ? 'svg' : 'png';
        
        if (ext === 'svg') {
          // For SVG files, create a simple colored rectangle as placeholder
          console.log(`  📄 Creating placeholder for SVG: ${background}`);
          page.drawRectangle({ 
            x: 0, 
            y: 0, 
            width: PAGE_W_PT, 
            height: PAGE_H_PT, 
            color: rgb(0.5, 0.7, 0.9) // Light blue placeholder
          });
        } else {
          let img;
          if (ext === 'jpg') {
            img = await bookPdf.embedJpg(buf);
          } else {
            img = await bookPdf.embedPng(buf);
          }
          const imgDims = img.scale(1);
          // Fit image to full bleed page (no aspect-crop; assumes you exported exact size)
          page.drawImage(img, { x: 0, y: 0, width: PAGE_W_PT, height: PAGE_H_PT });
        }
      }

      // Draw text overlay (with background boxes and wrapping)
      if (text) {
        console.log(`  📝 Adding text: "${text.content}"`);
        const txt = typeof text.content === 'string' ? text.content : String(text.content ?? '');
        const size = Number(text.size) || 24;
        const align = (text.align || 'left').toLowerCase(); // left | center | right
        const maxWidth = Number(text.maxWidth) || 0; // 0 = no wrap
        const lineHeight = (Number(text.lineHeight) || 1.2) * size;
        const wrap = text.wrap !== false; // default true
        const showBackground = text.background !== false; // default true
        console.log(`  🔍 Text debug: background=${text.background}, showBackground=${showBackground}, offsetAboveTrim=${text.offsetAboveTrim}, cornerRadius=${text.cornerRadius}`);

        const font = (text.font || '').toLowerCase().includes('bold') ? helveticaBold : helvetica;
        const textColor = text.color ? rgb(
          parseInt(text.color.slice(1,3), 16) / 255,
          parseInt(text.color.slice(3,5), 16) / 255,
          parseInt(text.color.slice(5,7), 16) / 255
        ) : rgb(0.2, 0.2, 0.2);

        const startX = Number.isFinite(text.x) ? Number(text.x) : 0;

        // Build lines (simple word wrapping if maxWidth provided)
        let lines = [txt];
        if (wrap && maxWidth > 0) {
          lines = [];
          const words = txt.split(/\s+/);
          let current = '';
          for (const w of words) {
            const trial = current ? `${current} ${w}` : w;
            const width = font.widthOfTextAtSize(trial, size);
            if (width <= maxWidth || current === '') {
              current = trial;
            } else {
              lines.push(current);
              current = w;
            }
          }
          if (current) lines.push(current);
        }

        // Calculate text box dimensions (scaled for 300 DPI)
        const textHeight = lines.length * lineHeight;
        const innerWidth = maxWidth > 0 ? maxWidth : Math.max(...lines.map(line => font.widthOfTextAtSize(line, size)));
        
        // Position text box just above the bottom trim (bleed line is 0.25in)
        const trimBottom = 0.25 * INCH; // 75pt at 300 DPI
        const offsetAboveTrim = Number(text.offsetAboveTrim) || 75; // Already in 300 DPI points
        const boxPadding = Number(text.padding) || 40; // Already in 300 DPI points
        const cornerRadius = Number(text.cornerRadius) || 125; // Already in 300 DPI points
        const boxHeight = textHeight + (boxPadding * 2);
        const boxWidth = innerWidth + (boxPadding * 2);
        const boxY = trimBottom + offsetAboveTrim; // bottom of box
        const boxX = startX - boxPadding; // left of box (startX is already in 300 DPI)

        // Draw background box if enabled
        if (showBackground) {
          console.log(`  📦 Drawing background box: x=${boxX}, y=${boxY}, w=${boxWidth}, h=${boxHeight}, r=${cornerRadius}`);
          
          // Use PNG overlay for rounded rectangle
          try {
            // Always use standard-box.png for consistent appearance
            // The scaling will handle different text sizes
            const boxImage = await fetchAsBuffer('http://localhost:8787/assets/overlays/text-boxes/standard-box.png');
            
        if (boxImage) {
          const boxPngImage = await bookPdf.embedPng(boxImage);
          
          // Scale the PNG to fit the calculated text box dimensions
          // Your PNG is 1969x375 pixels, we need to scale it to boxWidth x boxHeight
          const scaleX = boxWidth / boxPngImage.width;
          const scaleY = boxHeight / boxPngImage.height;
          const scale = Math.min(scaleX, scaleY); // Preserve aspect ratio
          
          const scaledWidth = boxPngImage.width * scale;
          const scaledHeight = boxPngImage.height * scale;
          
          // Center the scaled box within the text area
          const centerX = boxX + (boxWidth - scaledWidth) / 2;
          const centerY = boxY + (boxHeight - scaledHeight) / 2;
          
          page.drawImage(boxPngImage, {
            x: centerX,
            y: centerY,
            width: scaledWidth,
            height: scaledHeight
          });
          
          console.log(`  ✅ Drew PNG background box: ${scaledWidth.toFixed(1)}x${scaledHeight.toFixed(1)} (scaled from ${boxPngImage.width}x${boxPngImage.height})`);
        } else {
              console.log(`  ⚠️ Could not load box image, falling back to rectangle`);
              // Fallback to simple rectangle
              page.drawRectangle({
                x: boxX,
                y: boxY,
                width: boxWidth,
                height: boxHeight,
                color: rgb(0.93, 0.91, 0.76),
                opacity: 0.5
              });
            }
          } catch (error) {
            console.log(`  ⚠️ Error loading box image: ${error.message}, falling back to rectangle`);
            // Fallback to simple rectangle
            page.drawRectangle({
              x: boxX,
              y: boxY,
              width: boxWidth,
              height: boxHeight,
              color: rgb(0.93, 0.91, 0.76),
              opacity: 0.5
            });
          }
        }

        // Draw text lines
        // Start from inside the box (top padding down to first baseline)
        // Use calculated box height for text positioning
        let cursorY = boxY + boxHeight - boxPadding - size;
        for (const line of lines) {
          const lineWidth = font.widthOfTextAtSize(line, size);
          let drawX = startX; // startX is already in 300 DPI
          if (maxWidth > 0) {
            if (align === 'center') {
              drawX = startX + (innerWidth - lineWidth) / 2;
            } else if (align === 'right') {
              drawX = startX + (innerWidth - lineWidth);
            }
          } else {
            if (align === 'center') {
              drawX = startX - lineWidth / 2;
            } else if (align === 'right') {
              drawX = startX - lineWidth;
            }
          }

          page.drawText(line, {
            x: drawX,
            y: cursorY,
            size,
            font,
            color: textColor
          });
          cursorY -= lineHeight;
        }
      }

      // Draw image overlays (sorted by z-index)
      const sortedOverlays = overlays.sort((a, b) => (a.z || 0) - (b.z || 0));
      for (const overlay of sortedOverlays) {
        if (overlay.type === 'image' && overlay.src) {
          console.log(`  🖼️ Adding overlay: ${overlay.src}`);
          try {
            const overlayBuf = await fetchAsBuffer(overlay.src);
            const overlayImg = await bookPdf.embedPng(overlayBuf);
            
            // Auto-preserve aspect ratio: if only one dimension provided, calculate the other
            let { width, height } = overlay;
            if (width && !height) {
              // Calculate height from width, preserving aspect ratio
              height = (overlayImg.height / overlayImg.width) * width;
            } else if (height && !width) {
              // Calculate width from height, preserving aspect ratio
              width = (overlayImg.width / overlayImg.height) * height;
            } else if (!width && !height) {
              // Default size if neither provided
              width = 200;
              height = 200;
            }
            
            page.drawImage(overlayImg, {
              x: overlay.x || 0, // Already in 300 DPI
              y: overlay.y || 0, // Already in 300 DPI
              width: Math.round(width), // Already in 300 DPI
              height: Math.round(height) // Already in 300 DPI
            });
          } catch (e) {
            console.log(`  ⚠️ Failed to load overlay ${overlay.src}: ${e.message}`);
          }
        }
      }

      // (Optional) draw a small safety indicator during dev
      // Trim box (11x8.25in centered), comment out for production
      const trimX = 0.125 * INCH, trimY = 0.25 * INCH;
      page.drawRectangle({ 
        x: trimX, 
        y: trimY, 
        width: 11*INCH, 
        height: 8.25*INCH, 
        borderColor: rgb(1,0,0), 
        borderWidth: 0.5, 
        opacity: 0.3 
      });
    }

    const bookPdfBytes = await bookPdf.save();
    const bookPdfPath = path.join(outDir, 'book.pdf');
    fs.writeFileSync(bookPdfPath, bookPdfBytes);
    console.log(`  ✅ Book PDF saved: ${bookPdfPath}`);

    // Build a simple cover (cover.pdf) — reuse background or blank
    const coverPdf = await PDFDocument.create();
    const coverPage = coverPdf.addPage([PAGE_W_PT, PAGE_H_PT]);
    if (cover.front_background) {
      console.log(`  📖 Creating cover with background: ${cover.front_background}`);
      const cbuf = await fetchAsBuffer(cover.front_background);
      const cext = cover.front_background.toLowerCase().endsWith('.jpg') || cover.front_background.toLowerCase().endsWith('.jpeg') ? 'jpg' : 
                   cover.front_background.toLowerCase().endsWith('.svg') ? 'svg' : 'png';
      
      if (cext === 'svg') {
        // For SVG files, create a simple colored rectangle as placeholder
        console.log(`  📖 Creating placeholder for SVG cover: ${cover.front_background}`);
        coverPage.drawRectangle({ 
          x: 0, 
          y: 0, 
          width: PAGE_W_PT, 
          height: PAGE_H_PT, 
          color: rgb(0.5, 0.7, 0.9) // Light blue placeholder
        });
      } else {
        const cimg = cext === 'jpg' ? await coverPdf.embedJpg(cbuf) : await coverPdf.embedPng(cbuf);
        coverPage.drawImage(cimg, { x: 0, y: 0, width: PAGE_W_PT, height: PAGE_H_PT });
      }
    } else {
      coverPage.drawRectangle({ x:0, y:0, width: PAGE_W_PT, height: PAGE_H_PT, color: rgb(1,1,1) });
    }
    if (cover.title) {
      // Use custom bold font if available, otherwise standard
      const coverFont = customFontBold || await coverPdf.embedFont(StandardFonts.HelveticaBold);
      coverPage.drawText(cover.title, { 
        x: INCH*0.5, 
        y: PAGE_H_PT - INCH*1.25, 
        size: 24, 
        font: coverFont, 
        color: rgb(0.15,0.13,0.12) 
      });
    }
    const coverPdfBytes = await coverPdf.save();
    const coverPdfPath = path.join(outDir, 'cover.pdf');
    fs.writeFileSync(coverPdfPath, coverPdfBytes);
    console.log(`  ✅ Cover PDF saved: ${coverPdfPath}`);

    const base = `http://localhost:8787/out/${encodeURIComponent(orderId)}`;
    const response = {
      orderId,
      status: 'completed',
      bookPdfUrl: `${base}/book.pdf`,
      coverPdfUrl: `${base}/cover.pdf`,
      thumbUrl: `${base}/book.pdf`, // (placeholder; optionally create a JPG thumbnail)
      duration: `${Date.now() - req.startTime || 0}ms`,
      timestamp: new Date().toISOString()
    };

    console.log(`🎉 Order ${orderId} rendered successfully!`);
    console.log(`   Book: ${response.bookPdfUrl}`);
    console.log(`   Cover: ${response.coverPdfUrl}`);

    return res.json(response);
  } catch (e) {
    console.error('❌ Render error:', e);
    res.status(500).json({ error: String(e) });
  }
});

// Simple health check
app.get('/health', (req, res) => res.json({ 
  ok: true, 
  service: 'Little Hero Books Mock Renderer',
  version: '1.0.0',
  timestamp: new Date().toISOString()
}));

// List available background images
app.get('/assets/backgrounds', (req, res) => {
  const backgroundsDir = path.join(__dirname, 'assets', 'backgrounds');
  try {
    const files = fs.readdirSync(backgroundsDir)
      .filter(file => file.endsWith('.png') || file.endsWith('.jpg'))
      .map(file => ({
        name: file,
        url: `http://localhost:8787/assets/backgrounds/${file}`
      }));
    res.json({ backgrounds: files });
  } catch (e) {
    res.json({ backgrounds: [], error: 'No backgrounds directory found' });
  }
});

// Add request timing middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

// Test HTML endpoint
app.get('/test', (req, res) => {
  const htmlPath = path.join(__dirname, 'test-html.html');
  res.sendFile(htmlPath);
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`🚀 Little Hero Books Mock Renderer running on http://localhost:${PORT}`);
  console.log(`📁 Background images: http://localhost:${PORT}/assets/backgrounds`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`📄 Render endpoint: POST http://localhost:${PORT}/render`);
});
