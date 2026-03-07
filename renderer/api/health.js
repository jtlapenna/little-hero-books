// Lightweight health endpoint for backend renderer probing.
export default function handler(_, res) {
  res.status(200).json({
    ok: true,
    service: 'little-hero-books-renderer',
    timestamp: new Date().toISOString(),
  });
}
