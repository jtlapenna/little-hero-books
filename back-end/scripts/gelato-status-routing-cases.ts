import assert from 'node:assert/strict';

type RoutingRequest = { method: string; headers: Record<string, string>; body?: string };
// Node and workerd expose different Response types; use only the HTTP surface asserted here.
type RoutingResponse = { status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> };
export type RoutingSender = (path: string, init: RoutingRequest) => Promise<RoutingResponse>;

/** Shared HTTP cases run through both real middleware and the packaged OpenNext entrypoint. */
export async function verifyGelatoStatusRouting(send: RoutingSender, credentials: { backend: string; cron: string; webhook: string }) {
  const { backend, cron, webhook } = credentials;
  assert(new Set([backend, cron, webhook]).size === 3, 'Authorities must remain distinct');
  const poll = '/api/cron/gelato-status', hook = '/api/webhooks/gelato';
  const event = { id: 'routing-event-synthetic', event: 'order_status_updated', orderId: 'routing-provider-synthetic', orderReferenceId: 'routing-order-synthetic' };
  const body = JSON.stringify(event);
  const check = async (path: string, method: string, headers: Record<string, string>, status: number, payload?: object, input?: string) => {
    const response = await send(path, { method, headers, ...(input === undefined ? {} : { body: input }) });
    assert.equal(response.status, status, `${method} ${path}`);
    assert.equal(response.headers.get('location'), null, 'Machine/provider calls must not redirect');
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    if (payload) assert.deepEqual(await response.json(), payload, 'Must reach actual OFF handler, not a generic authorized endpoint');
  };
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const webhookHeader = (token: string) => ({ 'content-type': 'application/json', 'x-lhl-gelato-webhook-token': token });
  const disabledPoll = { disabled: true, checked: 0, delivered: 0, customerMessages: false };
  const disabledHook = { accepted: true, disposition: 'disabled' };

  // Neither caller has backend authority or a signed human cookie.
  await check(poll, 'POST', bearer(cron), 200, disabledPoll, '{}');
  await check(hook, 'POST', webhookHeader(webhook), 200, disabledHook, body);
  await check(hook, 'POST', webhookHeader(webhook), 200, disabledHook, body); // Replay stays OFF.
  await check(poll, 'POST', bearer(cron), 200, disabledPoll, '{}');
  const rejectedPollHeaders: Record<string, string>[] = [{}, bearer('wrong'), bearer(backend), bearer(webhook), { 'x-lhl-gelato-webhook-token': webhook }, { authorization: `Bearer ${cron}, Bearer ${backend}` }, { origin: 'https://admin.example.test', referer: 'https://admin.example.test/' }];
  for (const headers of rejectedPollHeaders) {
    await check(poll, 'POST', headers, 401, undefined, '{}');
  }
  const rejectedWebhookHeaders: Record<string, string>[] = [{}, bearer(backend), bearer(cron), webhookHeader('wrong'), webhookHeader(cron), webhookHeader(backend), webhookHeader(`${webhook}, ${webhook}`), { origin: 'https://admin.example.test', referer: 'https://admin.example.test/' }];
  for (const headers of rejectedWebhookHeaders) {
    await check(hook, 'POST', headers, 401, undefined, body);
  }
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE']) {
    await check(poll, method, bearer(cron), 401);
    await check(hook, method, webhookHeader(webhook), 401);
  }
  for (const path of [poll + '/extra', poll + '/', hook + '/extra', hook + '/', '/api/cron/gelato-status-other', '/api/webhooks/gelato-other']) {
    await check(path, 'POST', { ...bearer(cron), ...webhookHeader(webhook) }, 401, undefined, body);
  }
  // New POST exception cannot open POST on any legacy GET-only cron route.
  for (const path of ['/api/cron/amazon-orders', '/api/cron/book-config-integrity', '/api/cron/health-monitor', '/api/cron/router']) {
    await check(path, 'POST', bearer(cron), 401, undefined, '{}');
  }
  await check(hook, 'POST', webhookHeader(webhook), 400, undefined, '{invalid');
  await check(hook, 'POST', { 'x-lhl-gelato-webhook-token': webhook, 'content-type': 'text/plain' }, 415, undefined, body);
  await check(hook, 'POST', webhookHeader(webhook), 413, undefined, JSON.stringify({ ...event, extra: 'x'.repeat(66_000) }));
  await check(hook, 'POST', webhookHeader(webhook), 200, { accepted: true, disposition: 'unsupported' }, JSON.stringify({ event: 'future-event' }));
}
