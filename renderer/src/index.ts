
import express from "express";
import { renderBook } from "./render.js";
import { config } from "dotenv";

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

// Render endpoint
app.post("/render", async (req, res) => {
  const startTime = Date.now();
  const orderId = req.body?.orderId || 'unknown';
  
  log('info', `Starting render for order: ${orderId}`);
  
  try {
    const out = await renderBook(req.body);
    const duration = Date.now() - startTime;
    
    log('info', `Render completed for order: ${orderId}`, {
      duration: `${duration}ms`,
      bookPdfUrl: out.bookPdfUrl,
      coverPdfUrl: out.coverPdfUrl
    });
    
    res.json(out);
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
