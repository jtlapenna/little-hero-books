import assert from 'node:assert/strict';
import { buildBookConfigPublishPayload, loadBundledBookConfig, publishBookConfig } from '../src/lib/books';

type Row = ReturnType<typeof buildBookConfigPublishPayload>;

async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key' });
  const config = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 });
  const v1 = loadBundledBookConfig({ bookId: config.bookId, version: 1 });
  const same = buildBookConfigPublishPayload(config, { publishedBy: 'synthetic', activate: false });
  const prior = buildBookConfigPublishPayload({ ...v1, status: 'active' }, { publishedBy: 'synthetic', activate: true });
  const changed = { ...config, status: 'active' as const };
  const approved = buildBookConfigPublishPayload(changed, { publishedBy: 'synthetic', activate: false });
  const originalFetch = globalThis.fetch;

  function scenario(initial: Row[], options: { raceRow?: Row; failActivation?: boolean } = {}) {
    const rows = initial.map((row) => ({ ...row }));
    const writes: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      assert.equal(url.origin, 'https://db.example.test');
      const method = input instanceof Request ? input.method : init?.method ?? 'GET';
      if (method !== 'GET') writes.push(`${method} ${url.pathname}`);
      if (url.pathname === '/rest/v1/book_configs' && method === 'GET') {
        const version = Number(url.searchParams.get('version')?.replace('eq.', ''));
        return new Response(JSON.stringify(rows.filter((row) => row.version === version)), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.pathname === '/rest/v1/book_configs' && method === 'POST') {
        if (options.raceRow) {
          rows.push(options.raceRow);
          options.raceRow = undefined;
          return new Response(JSON.stringify({ code: '23505', message: 'Synthetic duplicate version' }), {
            status: 409, headers: { 'Content-Type': 'application/json' },
          });
        }
        const body = JSON.parse(String(input instanceof Request ? await input.text() : init?.body)) as Row;
        rows.push(body);
        return new Response('[]', { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/rest/v1/rpc/activate_book_config_version' && method === 'POST') {
        if (options.failActivation) {
          return new Response(JSON.stringify({ code: 'P0001', message: 'Synthetic transaction failure' }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
          });
        }
        const body = JSON.parse(String(input instanceof Request ? await input.text() : init?.body)) as {
          p_book_id: string; p_version: number; p_checksum: string; p_expected_config_json: unknown;
        };
        const target = rows.find((row) => row.book_id === body.p_book_id && row.version === body.p_version && row.checksum === body.p_checksum);
        assert.ok(target, 'Activation RPC must receive the pinned target');
        assert.deepEqual(body.p_expected_config_json, target.config_json, 'Activation RPC must bind the full approved JSON');
        if (target.status !== 'active') {
          return new Response(JSON.stringify({ code: 'P0001', message: 'Draft snapshot cannot be activated' }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
          });
        }
        for (const row of rows) if (row.book_id === body.p_book_id) row.is_active = row === target;
        return new Response('null', { headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };
    return { rows, writes };
  }

  try {
    const mismatch = scenario([same]);
    await assert.rejects(() => publishBookConfig(changed), /already exists with a different checksum/);
    assert.deepEqual(mismatch.writes, [], 'Existing version must not be overwritten');

    const retry = scenario([same]);
    assert.equal((await publishBookConfig(config)).checksum, same.checksum);
    assert.deepEqual(retry.writes, [], 'Identical version publish should be read-only');

    const first = scenario([]);
    assert.equal((await publishBookConfig(config)).checksum, same.checksum);
    assert.deepEqual(first.writes, ['POST /rest/v1/book_configs']);

    const race = scenario([], { raceRow: same });
    assert.equal((await publishBookConfig(config)).checksum, same.checksum);
    assert.deepEqual(race.writes, ['POST /rest/v1/book_configs']);

    const draftPromotion = scenario([prior, same]);
    await assert.rejects(() => publishBookConfig(config, { activate: true }), /Draft snapshot cannot be activated/);
    assert.equal(draftPromotion.rows.find((row) => row.version === 1)?.is_active, true);
    const failedPromotion = scenario([prior, approved], { failActivation: true });
    await assert.rejects(() => publishBookConfig(changed, { activate: true }), /Synthetic transaction failure/);
    assert.equal(failedPromotion.rows.find((row) => row.version === 1)?.is_active, true);
    assert.equal(failedPromotion.rows.find((row) => row.version === 2)?.is_active, false);
    assert.deepEqual(failedPromotion.writes, ['POST /rest/v1/rpc/activate_book_config_version']);

    const promoted = scenario([prior, approved]);
    assert.equal((await publishBookConfig(changed, { activate: true })).row.is_active, true);
    assert.equal(promoted.rows.find((row) => row.version === 1)?.is_active, false);
    assert.deepEqual(promoted.writes, ['POST /rest/v1/rpc/activate_book_config_version']);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('Published book config immutability and activation regressions passed');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
