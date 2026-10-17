import assert from 'node:assert/strict';
import { installAdminSessionMonitor, adminSessionExpired, subscribeAdminSession } from '../src/lib/admin-session-client';
import { ADMIN_SIGN_IN_HEADER } from '../src/lib/admin-login-target';

async function main() {
  let calls = 0; let response = Response.json({ ok: true }); let received: unknown;
  const document = new EventTarget() as EventTarget & { visibilityState: string };
  document.visibilityState = 'visible';
  const events = new EventTarget();
  const browser = { location: { origin: 'https://admin.littleherolabs.com', href: 'https://admin.littleherolabs.com/orders', pathname: '/orders' },
    document, addEventListener: events.addEventListener.bind(events),
    fetch: async (_input: unknown, init: unknown) => { calls++; received = init; return response; } };
  installAdminSessionMonitor(browser as unknown as Window);
  assert.equal(calls, 1, 'one initial no-data session probe');
  events.dispatchEvent(new Event('pageshow')); assert.equal(calls, 1, 'coalesce lifecycle probes');
  await new Promise((resolve) => setTimeout(resolve, 0));
  response = Response.json({ error: 'unavailable' }, { status: 503 });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(adminSessionExpired(), false, 'network/server errors do not assert expiry');
  response = Response.json({ error: 'Unauthorized' }, { status: 401 });
  await browser.fetch('/api/preview/validate-token', {});
  assert.equal(adminSessionExpired(), false, 'ordinary customer/explicit bearer rejection is not marked');
  response = Response.json({ error: 'Unauthorized' }, { status: 401, headers: { [ADMIN_SIGN_IN_HEADER]: 'required' } });
  await browser.fetch('https://other.example.test/api/orders', {});
  assert.equal(adminSessionExpired(), false, 'foreign responses ignored');
  let notified = 0;
  const unsubscribe = subscribeAdminSession(() => notified++);
  const init = { method: 'POST', body: 'original-unchanged-body' };
  const before = calls;
  const returned = await browser.fetch('/api/admin/synthetic-action', init);
  assert.equal(returned, response); assert.equal(received, init); assert.equal(calls, before + 1, 'never replay mutations');
  assert.equal(returned.bodyUsed, false); assert.equal(adminSessionExpired(), true); assert.equal(notified, 1);
  assert.equal(adminSessionExpired(), true, 'late hydration subscriber sees initial failed fetch');
  events.dispatchEvent(new Event('pageshow')); assert.equal(calls, before + 1, 'no polling after expiry');
  unsubscribe();
  console.log('Session lifecycle recovery: early probe, lifecycle deduplication, unchanged fetch/body, explicit marker, late hydration and no mutation replay passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
