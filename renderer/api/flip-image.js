import sharp from 'sharp';

// Require an internal bearer token when configured.
function isAuthorized(req) {
  const expected = (process.env.RENDERER_INTERNAL_TOKEN || '').trim();
  if (!expected) return true;
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') && auth.slice(7) === expected;
}

// Flip image horizontally and return PNG bytes.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }
  if (!isAuthorized(req)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    const { imageBase64, imageUrl, mimeType } = req.body || {};
    const normalizedMime =
      typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'image/png';
    if (!normalizedMime.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'Invalid mimeType' });
      return;
    }

    let sourceBuffer;
    if (typeof imageBase64 === 'string' && imageBase64.trim()) {
      sourceBuffer = Buffer.from(imageBase64, 'base64');
    } else if (typeof imageUrl === 'string' && imageUrl.trim()) {
      const source = await fetch(imageUrl, { method: 'GET' });
      if (!source.ok) {
        res.status(400).json({ success: false, error: `Failed to fetch imageUrl (${source.status})` });
        return;
      }
      sourceBuffer = Buffer.from(await source.arrayBuffer());
    } else {
      res.status(400).json({ success: false, error: 'Missing imageBase64 or imageUrl' });
      return;
    }

    if (!sourceBuffer.length) {
      res.status(400).json({ success: false, error: 'Decoded image is empty' });
      return;
    }

    const { data: flippedPngBuffer } = await sharp(sourceBuffer).flop().png().toBuffer({
      resolveWithObject: true,
    });

    res.status(200).json({
      success: true,
      mimeType: 'image/png',
      flippedImageBase64: flippedPngBuffer.toString('base64'),
      bytesIn: sourceBuffer.length,
      bytesOut: flippedPngBuffer.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message || 'Flip-image failed' });
  }
}
