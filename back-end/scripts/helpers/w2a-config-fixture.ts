import assert from 'node:assert/strict';
import { buildBookConfigPublishPayload, loadBundledBookConfig } from '../../src/lib/books';

/** Synthetic published config reads only. Every other fetch fails locally. */
export function installW2AConfigFixture() {
  const originalFetch = globalThis.fetch;
  const environment = {
    SUPABASE_URL: 'https://w2a-config.example.test',
    SUPABASE_SECRET_KEY: 'synthetic-w2a-config-key',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-w2a-config-key',
    BOOK_CONFIG_RUNTIME_SOURCE: 'published',
  };
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  const rows = ['book-2-example', 'book-mvp-simple-adventure'].map(bookId =>
    buildBookConfigPublishPayload(loadBundledBookConfig({ bookId, version: 1 }), { activate: true }),
  );
  const reads: string[] = [];
  const attempts: Array<{ origin: string; pathname: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = input instanceof Request ? input.method : init?.method ?? 'GET';
    attempts.push({ origin: url.origin, pathname: url.pathname, method });
    assert.equal(url.origin, environment.SUPABASE_URL, 'Outbound host blocked');
    assert.equal(method, 'GET', 'Config fixture forbids writes');
    assert.equal(url.pathname, '/rest/v1/book_configs', 'Only config reads allowed');
    for (const key of url.searchParams.keys()) {
      assert.ok(['select', 'book_id', 'version', 'is_active', 'order', 'limit'].includes(key), `Unsupported selector: ${key}`);
    }
    assert.equal(url.searchParams.get('select'), '*');
    const bookId = url.searchParams.get('book_id');
    assert.ok(bookId?.startsWith('eq.'), 'Book selector required');
    if (url.searchParams.has('version')) {
      assert.match(url.searchParams.get('version')!, /^eq\.[1-9][0-9]*$/);
      assert.deepEqual([...url.searchParams.keys()].sort(), ['book_id', 'select', 'version']);
    } else {
      assert.deepEqual([...url.searchParams.keys()].sort(), ['book_id', 'is_active', 'limit', 'order', 'select']);
      assert.equal(url.searchParams.get('is_active'), 'eq.true');
      assert.equal(url.searchParams.get('order'), 'version.desc');
      assert.equal(url.searchParams.get('limit'), '1');
    }
    const selected = rows.filter(row => `eq.${row.book_id}` === bookId &&
      (!url.searchParams.has('version') || `eq.${row.version}` === url.searchParams.get('version')) &&
      (!url.searchParams.has('is_active') || `eq.${row.is_active}` === url.searchParams.get('is_active')));
    reads.push(`${bookId}:${url.searchParams.get('version') ?? 'active'}`);
    return new Response(JSON.stringify(selected), { headers: { 'Content-Type': 'application/json' } });
  };
  return {
    reads,
    attempts,
    restore() {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}
