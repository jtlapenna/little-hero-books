
import express, { Request, Response } from "express";
import { renderBook } from "./render.js";
import { config } from "dotenv";
import { uploadToStorage } from "./storage.js";
import sharp from "sharp";

// Load environment variables from parent directory
config({ path: '../.env' });

const app = express();
app.use(express.json({ limit: "20mb" }));

// Environment configuration
const port = process.env.RENDERER_PORT || process.env.PORT || 8787;
const nodeEnv = process.env.NODE_ENV || 'development';
const debugMode = process.env.DEBUG_MODE === 'true';
const testMode = process.env.ENABLE_TEST_MODE === 'true';
const rendererInternalToken = process.env.RENDERER_INTERNAL_TOKEN || '';

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

type FlipImageBody = {
  imageBase64?: unknown;
  imageUrl?: unknown;
  mimeType?: unknown;
};

// Shared auth gate for internal service-to-service endpoints.
function requireInternalToken(req: Request, res: Response): boolean {
  if (!rendererInternalToken) return true;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized - missing bearer token' });
    return false;
  }
  if (auth.slice(7) !== rendererInternalToken) {
    res.status(401).json({ success: false, error: 'Unauthorized - invalid bearer token' });
    return false;
  }
  return true;
}

// Health check with environment info
app.get("/health", (_: Request, res: Response) => {
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

// Internal utility endpoint: flips an input image horizontally and returns PNG bytes.
app.post("/flip-image", async (req: Request, res: Response) => {
  const startedAt = Date.now();
  if (!requireInternalToken(req, res)) return;

  try {
    const { imageBase64, imageUrl, mimeType } = (req.body || {}) as FlipImageBody;

    const normalizedMime = typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'image/png';
    if (!normalizedMime.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'Invalid mimeType' });
      return;
    }

    // Accept either inline bytes or URL to avoid sending very large payloads through edge workers.
    let sourceBuffer: Buffer;
    if (typeof imageBase64 === 'string' && imageBase64.trim()) {
      sourceBuffer = Buffer.from(imageBase64, 'base64');
    } else if (typeof imageUrl === 'string' && imageUrl.trim()) {
      const sourceResponse = await fetch(imageUrl, { method: 'GET' });
      if (!sourceResponse.ok) {
        res.status(400).json({
          success: false,
          error: `Failed to fetch imageUrl (${sourceResponse.status})`,
        });
        return;
      }
      sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());
    } else {
      res.status(400).json({ success: false, error: 'Missing imageBase64 or imageUrl' });
      return;
    }

    if (!sourceBuffer.length) {
      res.status(400).json({ success: false, error: 'Decoded image is empty' });
      return;
    }

    // Flip pixels in Node runtime using sharp and always emit PNG for deterministic writes.
    const { data: flippedPngBuffer } = await sharp(sourceBuffer)
      .flop()
      .png()
      .toBuffer({ resolveWithObject: true });

    res.json({
      success: true,
      mimeType: 'image/png',
      flippedImageBase64: flippedPngBuffer.toString('base64'),
      bytesIn: sourceBuffer.length,
      bytesOut: flippedPngBuffer.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error: any) {
    log('error', 'Flip-image failed', { message: error?.message, stack: error?.stack });
    res.status(500).json({
      success: false,
      error: error?.message || 'Flip-image failed',
      durationMs: Date.now() - startedAt,
    });
  }
});

// Render endpoint - n8n compatible with R2/S3 storage
app.post("/render", async (req: Request, res: Response) => {
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
      spec: spec || { format: '8.5x8.5', pages: 16, binding: 'softcover' },
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
