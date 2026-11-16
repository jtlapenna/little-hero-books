/** Native Worker transport. Callers retain non-2xx handling and pending-source ownership. */
export function postW0Webhook(url: string, payload: unknown): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), redirect: 'manual', signal: AbortSignal.timeout(30_000) });
}
