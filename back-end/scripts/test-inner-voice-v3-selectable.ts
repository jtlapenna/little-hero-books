#!/usr/bin/env tsx
/**
 * Phase 008: bundled Inner Voice v3 is status active (r3 plus exactly one status line). Active changes who MAY select
 * it, never who does: selection still needs a published, active database row. Offline; PostgREST is a local fake.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBundledBookConfig, listBundledBookConfigs } from '../src/lib/books/load-book-config';
import { BookConfigSchema } from '../src/lib/books/types';
import { assertBookConfigSemantics } from '../src/lib/books/book-config-semantics';
import { validateBookRenderRecipe } from '../src/lib/books/book-render-recipe';
import { buildBookConfigPublishPayload, computeBookConfigChecksum } from '../src/lib/books/runtime-book-config';
import { BUNDLED_APPROVALS, hasRecordedFlowReleaseApproval } from '../src/lib/books/flow-release';
import { DEFAULT_R3, R3_SHA256, V3_ACTIVE_SHA256, V3_FILE, r3ToV3ActiveBytes } from './build-inner-voice-config-v3';

const BOOK = 'book-finding-our-inner-voice';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const failed: string[] = [];
async function check(name: string, action: () => Promise<void> | void) {
  try { await action(); console.log('PASS', name); } catch (error) { failed.push(name); console.error('FAIL', name, String(error)); }
}

type Row = Record<string, unknown>;
let rows: Row[] = [];
let networkAttempts = 0;
function installFakePostgrest() {
  process.env.SUPABASE_URL = 'https://v3-selectable.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-v3-selectable-only';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== 'v3-selectable.example.test' || !url.pathname.endsWith('/rest/v1/book_configs')) { networkAttempts++; throw new Error('Offline test forbids network'); }
    let matches = rows.filter(row => row.book_id === url.searchParams.get('book_id')?.replace(/^eq\./, ''));
    const active = url.searchParams.get('is_active'); if (active) matches = matches.filter(row => String(row.is_active) === active.replace(/^eq\./, ''));
    const version = url.searchParams.get('version'); if (version) matches = matches.filter(row => String(row.version) === version.replace(/^eq\./, ''));
    matches = [...matches].sort((a, b) => Number(b.version) - Number(a.version));
    const headers = new Headers(init?.headers); const single = (headers.get('accept') ?? '').includes('vnd.pgrst.object');
    if (single) {
      if (matches.length !== 1 && !url.searchParams.get('limit')) return Response.json({ code: 'PGRST116', message: 'no rows', details: 'The result contains 0 rows' }, { status: 406 });
      if (!matches.length) return Response.json({ code: 'PGRST116', message: 'no rows', details: 'The result contains 0 rows' }, { status: 406 });
      return Response.json(matches[0]);
    }
    return Response.json(matches);
  }) as typeof fetch;
}
const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { networkAttempts++; throw new Error('Offline test forbids network'); }) as typeof fetch;
  const v3 = loadBundledBookConfig({ bookId: BOOK, version: 3 });

  await check('v3.json is the pinned active bytes and equals r3 modulo exactly the status line', () => {
    const bytes = readFileSync(V3_FILE);
    assert.equal(sha(bytes), V3_ACTIVE_SHA256);
    const lines = bytes.toString('utf8').split('\n');
    assert.equal(lines[5], '  "status": "active",');
    // Reverting that one line must reproduce r3 exactly (hash pinned, no r3 file needed in CI).
    const reverted = [...lines]; reverted[5] = '  "status": "draft",';
    assert.equal(sha(Buffer.from(reverted.join('\n'), 'utf8')), R3_SHA256, 'only line 6 differs from r3');
    assert.equal(lines.filter(line => /^\s*"status":\s*"draft"/.test(line)).length, 0);
    if (existsSync(DEFAULT_R3)) {
      const r3 = readFileSync(DEFAULT_R3); assert.equal(sha(r3), R3_SHA256);
      assert.ok(bytes.equals(r3ToV3ActiveBytes(r3)));
      const a = r3.toString('utf8').split('\n'), b = lines;
      assert.equal(a.length, b.length);
      assert.deepEqual(a.map((l, i) => (l === b[i] ? -1 : i)).filter(i => i >= 0), [5]);
    }
    assert.equal(computeBookConfigChecksum(v3), JSON.parse(readFileSync(resolve(V3_FILE, '..', 'v3.manifest.json'), 'utf8')).runtimeChecksum);
  });

  await check('v3 passes schema, semantics and render-recipe validation for both formats', () => {
    const parsed = BookConfigSchema.parse(JSON.parse(readFileSync(V3_FILE, 'utf8')));
    assert.equal(parsed.status, 'active'); assert.equal(parsed.version, 3);
    assertBookConfigSemantics(parsed);
    assert.deepEqual(Object.keys(parsed.formats).sort(), ['amazon', 'standard']);
    for (const formatId of ['standard', 'amazon']) validateBookRenderRecipe(parsed, formatId);
    assert.equal(parsed.rendering.recipe?.schema, 'lhb.book-render@v2');
  });

  await check('default bundled load is v1; v3 is only reachable by explicit version', () => {
    assert.equal(loadBundledBookConfig({ bookId: BOOK }).version, 1);
    assert.equal(listBundledBookConfigs().filter(c => c.bookId === BOOK && c.status === 'active').some(c => c.version === 3), true, 'v3 is bundled active');
  });

  await check('bundled active v3 needs no sign-off file: admin stage approvals are the gates', () => {
    assert.deepEqual([...BUNDLED_APPROVALS], []);
    const v3 = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 3 });
    for (const formatId of ['standard', 'amazon']) assert.equal(hasRecordedFlowReleaseApproval(v3, formatId), true);
  });

  installFakePostgrest();
  const { resolveCsvBookSelection, CsvBookSelectionError } = await import('../src/lib/csv-book-selection');
  const row = (overrides: Row = {}): Row => ({ ...buildBookConfigPublishPayload(v3, { publishedBy: 'synthetic', activate: true }), ...overrides });
  const amazon = { bookId: BOOK, formatId: 'amazon' };

  await check('CSV selection accepts v3 only with a published, active row', async () => {
    rows = [row()];
    const selection = await resolveCsvBookSelection(form(amazon));
    assert.equal(selection?.configVersion, 3); assert.equal(selection?.formatId, 'amazon');
    assert.equal(selection?.totalPages, v3.formats.amazon.interior.expectedPageCount);
    assert.equal((await resolveCsvBookSelection(form({ ...amazon, configVersion: '3' })))?.configVersion, 3);
    await assert.rejects(resolveCsvBookSelection(form({ ...amazon, configVersion: '2' })), (e: unknown) => e instanceof CsvBookSelectionError && (e as { status?: number }).status === 409);
  });

  await check('bundled active v3 alone is NOT selectable: no row, inactive row, draft row all refuse', async () => {
    rows = [];
    await assert.rejects(resolveCsvBookSelection(form(amazon)));
    rows = [row({ is_active: false })];
    await assert.rejects(resolveCsvBookSelection(form(amazon)));
    rows = [row({ is_active: false, status: 'draft' })];
    await assert.rejects(resolveCsvBookSelection(form(amazon)));
  });

  await check('a row whose stored checksum does not match its config is refused', async () => {
    rows = [row({ checksum: '0'.repeat(64) })];
    await assert.rejects(resolveCsvBookSelection(form(amazon)));
  });

  globalThis.fetch = originalFetch;
  assert.equal(networkAttempts, 0);
  assert.deepEqual(failed, []);
  console.log('v3 selectable checks passed; network attempts 0');
}
main().then(() => process.exit(process.exitCode ?? 0)).catch((error) => { console.error(error); process.exit(1); });
