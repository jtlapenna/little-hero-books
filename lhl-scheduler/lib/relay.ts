import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const destinations = Object.freeze({
  router: 'https://admin.littleherolabs.com/api/cron/router',
  'health-monitor': 'https://admin.littleherolabs.com/api/cron/health-monitor',
  'book-config-integrity': 'https://admin.littleherolabs.com/api/cron/book-config-integrity',
});
export type Job = keyof typeof destinations;
const deadlineMs = 240_000; // Below the packaged 300-second runtime maximum.
const validSecret = (value: string | undefined): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._~+/-]{16,512}={0,2}$/.test(value);

function reply(res: ServerResponse, status: number, outcome: string): void {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(status === 405 ? { Allow: 'GET' } : {}),
  });
  res.end(JSON.stringify({ outcome }));
}

/** One attempt per accepted invocation. An abort cannot undo upstream business effects. */
export async function relay(job: Job, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') return reply(res, 405, 'method_not_allowed');
  const ingress = process.env.CRON_SECRET;
  const upstream = process.env.LHL_BACKEND_CRON_SECRET;
  // Upstream must be the protected backend's CRON_SECRET, not an independent invented token.
  if (!validSecret(ingress) || !validSecret(upstream) || ingress === upstream) {
    return reply(res, 503, 'configuration_unavailable');
  }
  const authorization = req.headers.authorization;
  let rawAuthorizationCount = 0;
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() === 'authorization') rawAuthorizationCount++;
  }
  const expected = Buffer.from(`Bearer ${ingress}`);
  if (rawAuthorizationCount !== 1 || typeof authorization !== 'string' ||
      authorization.length > 530 || Buffer.byteLength(authorization) !== expected.length ||
      !timingSafeEqual(Buffer.from(authorization), expected)) {
    return reply(res, 401, 'unauthorized');
  }
  if (req.aborted || res.destroyed) return reply(res, 499, 'caller_cancelled');

  const controller = new AbortController();
  let stop: (value: { kind: 'deadline' | 'caller_cancelled' }) => void = () => undefined;
  const stopped = new Promise<{ kind: 'deadline' | 'caller_cancelled' }>(resolve => { stop = resolve; });
  const cancel = () => { stop({ kind: 'caller_cancelled' }); controller.abort(); };
  const closed = () => { if (!res.writableEnded) cancel(); };
  req.once('aborted', cancel);
  req.once('error', cancel);
  res.once('close', closed);
  const timer = setTimeout(() => { stop({ kind: 'deadline' }); controller.abort(); }, deadlineMs);
  let outcome = 'upstream_failed';
  let status = 502;
  try {
    // Deliberately no caller URL, body, query, cookies, headers, or request ID.
    const attempt = (async () => {
      try {
        const response = await fetch(destinations[job], {
          method: 'GET', redirect: 'manual', cache: 'no-store',
          headers: { Authorization: `Bearer ${upstream}` }, signal: controller.signal,
        });
        // Never consume a business payload. Cancellation cannot block the deadline.
        if (response.body) void response.body.cancel().catch(() => undefined);
        return { kind: 'response' as const, status: response.status };
      } catch { return { kind: 'network' as const }; }
    })();
    const result = await Promise.race([attempt, stopped]);
    if (result.kind === 'deadline') { outcome = 'upstream_timeout'; status = 504; }
    else if (result.kind === 'caller_cancelled') { outcome = 'caller_cancelled'; status = 499; }
    else if (result.kind === 'response') {
      if (result.status >= 200 && result.status < 300) { outcome = 'upstream_accepted'; status = 200; }
      else if (result.status >= 300 && result.status < 400) outcome = 'upstream_redirect_rejected';
    }
    // Fixed values only; HTTP success does not prove every business subtask succeeded.
    console.info(JSON.stringify({ job, outcome, status }));
    reply(res, status, outcome);
  } finally {
    clearTimeout(timer);
    req.off('aborted', cancel);
    req.off('error', cancel);
    res.off('close', closed);
  }
}
