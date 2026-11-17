/** Actual OTP handlers, official SDK and shared authority under synthetic closed transports. */
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { requireAdminAuth } from '../src/lib/admin-auth';
import { createAdminSignInHandler } from '../src/lib/admin-signin-http';
import { applyManagedCookieUpdates } from '../src/lib/admin-managed-auth';
import { withBackendAccess } from '../src/lib/access-boundary';

async function main() {
  const originalFetch = globalThis.fetch, originalEnv = { ...process.env };
  const origin = 'https://admin.littleherolabs.com', provider = 'https://managed-auth.example.test';
  const now = Math.floor(Date.now() / 1000), email = 'jeff@example.test', id = '11111111-1111-4111-8111-111111111111';
  const key = new TextEncoder().encode('synthetic-managed-test-signing-key-only');
  const anon = await new SignJWT({ role: 'anon' }).setProtectedHeader({ alg: 'HS256' }).sign(key);
  const token = await new SignJWT({ sub: id, email, role: 'authenticated', exp: now + 3600 }).setProtectedHeader({ alg: 'HS256' }).sign(key);
  const user = { id, email, email_confirmed_at: new Date().toISOString(), aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {} };
  const session = { access_token: token, refresh_token: 'synthetic-managed-refresh', expires_at: now + 3600, expires_in: 3600, token_type: 'bearer', user };
  const encode = (value: unknown) => 'base64-' + Buffer.from(JSON.stringify(value)).toString('base64url');
  const cookie = '__Host-lhl-admin=' + encode(session);
  const calls: string[] = []; let badVerify = false, badUser = false, failRefresh = false, rateLimit = false, largeUser = false;
  Object.assign(process.env, { ADMIN_SUPABASE_AUTH_ENABLED: 'true', ADMIN_SITE_ORIGIN: origin, ADMIN_ALLOWED_EMAILS: email, SUPABASE_URL: provider, SUPABASE_ANON_KEY: anon, BACKEND_API_TOKEN: 'synthetic-machine' });
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    assert.equal(url.origin, provider, 'all live transports forbidden'); calls.push(url.pathname + url.search);
    if (url.pathname === '/auth/v1/otp') {
      const body = await request.json(); assert.equal(body.email, email); assert.equal(body.create_user, false);
      return rateLimit ? Response.json({ msg: 'synthetic rate limit' }, { status: 429 }) : Response.json({});
    }
    if (url.pathname === '/auth/v1/verify') {
      const body = await request.json(); assert.equal(body.type, 'email'); assert.equal(body.email, email);
      return badVerify ? Response.json({ msg: 'synthetic invalid code' }, { status: 403 }) : Response.json({ ...session, user: largeUser ? { ...user, user_metadata: { padding: 'x'.repeat(9000) } } : user });
    }
    if (url.pathname === '/auth/v1/user') { assert.equal(request.headers.get('authorization'), 'Bearer ' + token); return Response.json(badUser ? { ...user, email: 'outsider@example.test' } : user); }
    if (url.pathname === '/auth/v1/token') { assert.equal(url.search, '?grant_type=refresh_token'); assert.equal((await request.json()).refresh_token, session.refresh_token); return failRefresh ? Response.json({ msg: 'invalid refresh token', error_code: 'refresh_token_not_found' }, { status: 400 }) : Response.json(session); }
    if (url.pathname === '/auth/v1/logout') { assert.equal(url.search, '?scope=local'); return new Response(null, { status: 204 }); }
    throw Error('Unexpected transport ' + request.url);
  };
  const post = (action: string, body: unknown, headers: Record<string, string> = {}) => new Request(origin + '/api/auth/' + action, { method: 'POST', headers: { origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const requestCode = createAdminSignInHandler('request'), verifyCode = createAdminSignInHandler('verify'), logout = createAdminSignInHandler('logout');
  const jarFrom = (response: Response) => response.headers.getSetCookie().filter(value => !value.includes('Max-Age=0')).map(value => value.split(';')[0]).join('; ');
  try {
    const result = await requireAdminAuth(new Request(origin + '/orders', { headers: { cookie } }));
    assert.deepEqual(result, { ok: true, mode: 'supabase', actor: email });
    for (const duplicate of [cookie + '; ' + cookie, cookie + '; __Host-lhl-admin=bad', cookie + '; __Host-lhl-admin-remember=1; __Host-lhl-admin-remember=0']) {
      const before = calls.length; const rejected = await requireAdminAuth(new Request(origin + '/orders', { headers: { cookie: duplicate } }));
      assert.equal(rejected.ok, false); assert.equal(calls.length, before, 'raw duplicate denied before provider');
    }
    const beforeMachine = calls.length;
    assert.deepEqual(await requireAdminAuth(new Request(origin + '/orders', { headers: { cookie: '__Host-lhl-admin=bad', authorization: 'Bearer synthetic-machine' } })), { ok: true, mode: 'token', actor: 'backend-automation' });
    assert.equal(calls.length, beforeMachine);
    for (const [headers, allowed] of [
      [{ referer: origin + '/orders' }, true], [{ origin }, true],
      [{ origin: 'null', referer: origin + '/orders' }, false], [{ origin: '', referer: origin + '/orders' }, false],
      [{ origin: 'https://evil.test', referer: origin + '/orders' }, false],
      [{ referer: origin + '/orders', 'sec-fetch-site': 'cross-site' }, false], [{}, false],
      [{ referer: origin + '.evil.test/orders' }, false], [{ referer: origin.replace('https:', 'http:') + '/orders' }, false],
    ] as [Record<string,string>, boolean][]) {
      const auth = await requireAdminAuth(new Request(origin + '/api/admin/session', { headers: { cookie, ...headers } }), { protectReadActions: true }); assert.equal(auth.ok, allowed, JSON.stringify(headers));
    }
    const noOrigin = await requireAdminAuth(new Request(origin + '/api/orders', { method: 'POST', headers: { cookie, referer: origin + '/orders' } })); assert.equal(noOrigin.ok, false);
    assert.equal((await requestCode(post('request-code', { email }))).status, 200);
    const beforeUnknown = calls.length;
    assert.equal((await requestCode(post('request-code', { email: 'outsider@example.test' }))).status, 200); assert.equal(calls.length, beforeUnknown);
    rateLimit = true; assert.equal((await requestCode(post('request-code', { email }))).status, 429); rateLimit = false;
    for (const [headers, status] of [[{ origin: 'null' }, 403], [{ origin: 'https://evil.test' }, 403], [{ 'sec-fetch-site': 'cross-site' }, 403], [{ 'Content-Type': 'text/plain' }, 415]] as [Record<string,string>, number][]) assert.equal((await requestCode(post('request-code', { email }, headers))).status, status);
    assert.equal((await requestCode(new Request(origin + '/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }))).status, 403);
    assert.equal((await requestCode(post('request-code', { email, junk: 'x'.repeat(5000) }))).status, 413);
    for (const remember of [true, false]) {
      const response = await verifyCode(post('verify-code', { email, token: '123456', remember, returnTo: '/orders' }));
      assert.equal(response.status, 200, await response.clone().text()); assert.deepEqual(await response.json(), { authenticated: true, redirectTo: '/orders' });
      const authCookies = response.headers.getSetCookie().filter(value => value.startsWith('__Host-lhl-admin=') || value.startsWith('__Host-lhl-admin-remember='));
      assert(authCookies.length >= 2);
      for (const value of authCookies) { assert.match(value, /HttpOnly/i); assert.match(value, /Secure/); assert.match(value, /SameSite=Lax/i); assert(!/Domain=/i.test(value)); assert.equal(value.includes('Max-Age=2592000'), remember); if (!remember) assert(!/Max-Age=|Expires=/i.test(value)); }
      const jar = jarFrom(response); assert((await requireAdminAuth(new Request(origin + '/orders', { headers: { cookie: jar } }))).ok);
      const signedOut = await logout(post('sign-out', {}, { cookie: jar })); assert.equal(signedOut.status, 200);
      for (const value of signedOut.headers.getSetCookie()) { assert.match(value, /Max-Age=0/); assert.match(value, /Expires=Thu, 01 Jan 1970/); }
      assert.equal(signedOut.headers.getSetCookie().filter(value => value.startsWith('CF_Authorization=')).length, 2);
    }
    for (const remember of [true, false]) {
      const expired = '__Host-lhl-admin=' + encode({ ...session, expires_at: now - 60 }) + (remember ? '; __Host-lhl-admin-remember=1' : '');
      let downstream = 0;
      const response = await withBackendAccess(new Request(origin + '/api/admin/session', { headers: { cookie: expired, referer: origin + '/orders' } }), async forwarded => {
        downstream++; assert(!forwarded.headers.get('cookie')!.includes(encode({ ...session, expires_at: now - 60 })));
        assert((await requireAdminAuth(new Request(forwarded), { protectReadActions: true })).ok); return Response.json({ authenticated: true });
      });
      assert.equal(response.status, 200); assert.equal(downstream, 1); const values = response.headers.getSetCookie();
      assert(values.some(value => value.startsWith('__Host-lhl-admin=')));
      assert.equal(values.some(value => value.startsWith('__Host-lhl-admin-remember=1')), remember);
      for (const value of values) if (!value.includes('Max-Age=0')) assert.equal(value.includes('Max-Age=2592000'), remember);
    }
    largeUser = true;
    const chunked = await verifyCode(post('verify-code', { email, token: '123456', remember: true }));
    assert.equal(chunked.status, 200); const chunkJar = jarFrom(chunked); assert.match(chunkJar, /__Host-lhl-admin\.2=/);
    const cleaned = await logout(post('sign-out', {}, { cookie: chunkJar })); assert.equal(cleaned.status, 200); assert(cleaned.headers.getSetCookie().some(value => value.startsWith('__Host-lhl-admin.2=') && value.includes('Max-Age=0'))); largeUser = false;
    badVerify = true; assert.equal((await verifyCode(post('verify-code', { email, token: '123456', remember: true }))).status, 400); badVerify = false;
    badUser = true; assert.equal((await verifyCode(post('verify-code', { email, token: '123456', remember: true }))).status, 403); badUser = false;
    assert.equal((await verifyCode(post('verify-code', { email, token: '123456', remember: true, returnTo: '//evil.test' }))).status, 400);
    failRefresh = true;
    const failed = new Request(origin + '/orders', { headers: { cookie: '__Host-lhl-admin=' + encode({ ...session, expires_at: now - 60 }) } });
    assert.equal((await requireAdminAuth(failed)).ok, false); assert(applyManagedCookieUpdates(failed, new Response()).headers.getSetCookie().some(value => value.includes('Max-Age=0')));
    process.env.ADMIN_SUPABASE_AUTH_ENABLED = 'false'; assert.equal((await requestCode(post('request-code', { email }))).status, 503);
    assert.equal((await logout(post('sign-out', {}, { cookie }))).status, 200);
    console.log('Managed auth: actual SDK/OTP handlers, approved identity, Origin/Referer, duplicate denial, machine priority, 30-day/session cookie persistence, refresh forwarding, chunked logout, expired codes, provider failures and closed flag passed; zero live traffic');
  } finally { globalThis.fetch = originalFetch; for (const name of Object.keys(process.env)) if (!(name in originalEnv)) delete process.env[name]; Object.assign(process.env, originalEnv); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
