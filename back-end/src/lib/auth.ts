// Minimal bearer auth helper used by API routes
export function verifyBearerAuth(request: Request): { ok: boolean; error?: string } {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  const expected = process.env.BACKEND_API_TOKEN;

  if (!expected) return { ok: false, error: 'Server token not configured' };
  if (!header || !header.toLowerCase().startsWith('bearer ')) return { ok: false, error: 'Missing bearer token' };
  const provided = header.slice(7).trim();
  const expectedTrimmed = expected.trim();
  if (provided !== expectedTrimmed) return { ok: false, error: 'Invalid token' };
  return { ok: true };
}

