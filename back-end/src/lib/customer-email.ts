export function normalizeEmailForLookup(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, '+').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function emailsMatchForLookup(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeEmailForLookup(left);
  const normalizedRight = normalizeEmailForLookup(right);
  return !!normalizedLeft && !!normalizedRight && normalizedLeft === normalizedRight;
}
