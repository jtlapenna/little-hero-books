import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const reviewedPublicOwners = new Map<string, string[]>([
  ['api/pdf/[...path]/route.ts', ['GET', 'HEAD']],
  ['api/checkout/create/route.ts', ['POST']], ['api/preview/check/route.ts', ['GET', 'POST']],
  ['api/preview/generate/route.ts', ['POST']], ['api/preview/validate-token/route.ts', ['POST']],
  ['api/preview/contact/route.ts', ['POST']], ['api/webhooks/stripe/route.ts', ['POST']],
  ['api/webhooks/lulu/status/route.ts', ['POST']], ['api/preview/[orderId]/approve/route.ts', ['POST']],
  ['api/preview/[orderId]/reject/route.ts', ['POST']], ['api/preview/[orderId]/files/route.ts', ['POST']],
  ['api/preview/[orderId]/status/route.ts', ['GET']], ['api/assets/[...path]/route.ts', ['GET', 'HEAD']],
]);
const publicPatterns = [...reviewedPublicOwners.keys()].map(source => source.replace(/(?:^|\/)(?:route|page)\.[jt]sx?$/, '').replace(/\.[jt]sx?$/, ''))
  .concat(['_next/static/[...path]', 'favicon.ico', 'window.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'file.svg', 'pdf.worker.min.mjs']);

function pattern(source: string) {
  const segments = source.replace(/(?:^|\/)(?:route|page)\.[jt]sx?$/, '').replace(/\.[jt]sx?$/, '').split('/').filter(Boolean).filter(segment => !/^\([^.)][^/]*\)$/.test(segment) && !segment.startsWith('@'));
  const prefix: Array<string | null> = [];
  let minimumTail = 0, unbounded = false;
  for (const [index, segment] of segments.entries()) {
    if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment) || /^\[\.\.\.[^\]]+\]$/.test(segment)) {
      if (index !== segments.length - 1) throw new Error('Unsupported nonterminal catchall route');
      unbounded = true; minimumTail = segment.startsWith('[[') ? 0 : 1;
    } else if (/^\[[^\]]+\]$/.test(segment)) prefix.push(null);
    else {
      if (/[()[\]]/.test(segment)) throw new Error('Unsupported routing syntax requires explicit security review');
      prefix.push(segment);
    }
  }
  return { prefix, minimum: prefix.length + minimumTail, maximum: unbounded ? Infinity : prefix.length };
}
export function routePatternsIntersect(first: string, second: string) {
  const a = pattern(first), b = pattern(second);
  if (Math.max(a.minimum, b.minimum) > Math.min(a.maximum, b.maximum)) return false;
  for (let i = 0; i < Math.min(a.prefix.length, b.prefix.length); i++) if (a.prefix[i] !== null && b.prefix[i] !== null && a.prefix[i] !== b.prefix[i]) return false;
  return true;
}
export type AppRouteOwner = { source: string; methods: string[] };
export function readAppRouteInventory(appRoot: string): AppRouteOwner[] {
  const rows: AppRouteOwner[] = [];
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/^(?:route|page|icon|apple-icon|opengraph-image|twitter-image|sitemap|robots|manifest)\.[jt]sx?$/.test(entry.name)) {
        const text = readFileSync(path, 'utf8');
        rows.push({ source: relative(appRoot, path).replaceAll('\\', '/'), methods: /^route\./.test(entry.name) ? [...text.matchAll(/export\s+(?:async\s+function|function|const)\s+(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g)].map(match => match[1]) : ['GET', 'HEAD'] });
      }
    }
  }
  walk(appRoot); return rows;
}
export function assertPublicRouteInventory(rows: AppRouteOwner[]) {
  const found = new Map(rows.map(row => [row.source, row.methods]));
  for (const [owner, methods] of reviewedPublicOwners) {
    if (!found.has(owner) || methods.some(method => !found.get(owner)!.includes(method))) throw new Error(`Reviewed public owner/method missing: ${owner}`);
  }
  for (const row of rows) if (publicPatterns.some(publicPattern => routePatternsIntersect(row.source, publicPattern)) && !reviewedPublicOwners.has(row.source)) {
    throw new Error(`Unreviewed handler intersects a public exception: ${row.source}`);
  }
}
