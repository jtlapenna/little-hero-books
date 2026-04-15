const DEFAULT_CANONICAL_BACKEND_BASE_URL = 'https://admin.littleherolabs.com';

function normalizeUrlCandidate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') {
    return null;
  }

  return trimmed.replace(/\/+$/, '');
}

export function resolveCanonicalBackendBaseUrl(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const normalized = normalizeUrlCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return (
    normalizeUrlCandidate(process.env.ADMIN_BASE_URL) ??
    normalizeUrlCandidate(process.env.BACKEND_URL) ??
    DEFAULT_CANONICAL_BACKEND_BASE_URL
  );
}

export function buildCanonicalBackendUrl(pathname: string): string {
  return `${resolveCanonicalBackendBaseUrl()}/${pathname.replace(/^\/+/, '')}`;
}

export { DEFAULT_CANONICAL_BACKEND_BASE_URL };
