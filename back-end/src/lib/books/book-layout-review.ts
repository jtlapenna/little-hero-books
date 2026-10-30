/** New layout capabilities remain local-only until their hosted envelope is reviewed. */
export function requiresBookLayoutReview(schema: unknown): boolean {
  return schema === 'lhb.book-render@v3';
}
