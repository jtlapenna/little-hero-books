
import express from "express";
import { renderBook } from "./render.js";
import { config } from "dotenv";
import { uploadToStorage } from "./storage.js";

// Load environment variables from parent directory
config({ path: '../.env' });

const app = express();
app.use(express.json({ limit: "2mb" }));

// Environment configuration
const port = process.env.RENDERER_PORT || process.env.PORT || 8787;
const nodeEnv = process.env.NODE_ENV || 'development';
const debugMode = process.env.DEBUG_MODE === 'true';
const testMode = process.env.ENABLE_TEST_MODE === 'true';

// Logging helper
function log(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  
  if (debugMode || level === 'error') {
    console.log(logMessage);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

// Health check with environment info
app.get("/health", (_, res) => {
  res.json({ 
    ok: true,
    service: 'little-hero-books-renderer',
    version: '1.0.0',
    environment: nodeEnv,
    debug: debugMode,
    testMode: testMode,
    timestamp: new Date().toISOString()
  });
});

// Render endpoint - n8n compatible with R2/S3 storage
app.post("/render", async (req, res) => {
  const startTime = Date.now();
  const orderId = req.body?.orderId || 'unknown';
  
  log('info', `Starting render for order: ${orderId}`);
  
  try {
    // Validate input format matches spec: { spec, manuscript, assets, child, options }
    const { spec, manuscript, assets, child, options } = req.body;
    
    if (!manuscript || !child) {
      throw new Error('Missing required fields: manuscript and child are required');
    }
    
    const renderData = {
      orderId,
      spec: spec || { format: '8x10', pages: 16, binding: 'softcover' },
      manuscript,
      assets: assets || {}, // Prefab backgrounds and overlays
      child,
      options: options || {}
    };
    
    const out = await renderBook(renderData);
    const duration = Date.now() - startTime;
    
    // Upload to R2/S3 storage and generate signed URLs
    const storageUrls = await uploadToStorage(orderId, out);
    
    // n8n expects specific response format with signed URLs
    const response = {
      orderId: out.orderId,
      bookPdfUrl: storageUrls.bookPdfUrl,
      coverPdfUrl: storageUrls.coverPdfUrl,
      thumbUrl: storageUrls.thumbUrl || null,
      status: 'completed',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    };
    
    log('info', `Render completed for order: ${orderId}`, response);
    
    res.json(response);
  } catch (e: any) {
    const duration = Date.now() - startTime;
    
    log('error', `Render failed for order: ${orderId}`, {
      duration: `${duration}ms`,
      error: e?.message,
      stack: debugMode ? e?.stack : undefined
    });
    
    res.status(400).json({ 
      error: e?.message || "Render failed",
      orderId: orderId,
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
app.listen(port, () => {
  log('info', `Little Hero Books Renderer started`, {
    port: port,
    environment: nodeEnv,
    debug: debugMode,
    testMode: testMode
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', 'SIGINT received, shutting down gracefully');
  process.exit(0);
});
