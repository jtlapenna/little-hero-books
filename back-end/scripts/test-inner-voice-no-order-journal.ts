import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { LocalNoOrderJournal, inspectLocalNoOrderJournal } from '../src/lib/inner-voice-no-order/journal';
const binding = 'a'.repeat(64), ack = 'b'.repeat(64), evidence = 'c'.repeat(64);
async function main() {
if (process.argv[2] === '--crash') {
  const j = await LocalNoOrderJournal.claim(process.argv[3], binding);
  await j.dispatch({ operationId: 'crashed', stage: 'preview' }, async () => { process.exit(0); });
  throw Error('unreachable');
}
const root = await mkdtemp(path.join(tmpdir(), 'no-order-journal-'));
try {
  const spoofedBinding = { toString: () => binding } as unknown as string;
  await assert.rejects(LocalNoOrderJournal.claim(path.join(root, 'invalid-binding'), spoofedBinding), /invalid journal binding/);
  await assert.rejects(inspectLocalNoOrderJournal(root, spoofedBinding), /invalid journal binding/);
  const d = path.join(root, 'race');
  const race = await Promise.allSettled([LocalNoOrderJournal.claim(d, binding), LocalNoOrderJournal.claim(d, binding)]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  const j = (race.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<LocalNoOrderJournal>).value;
  let calls = 0;
  await j.dispatch({ operationId: 'one', stage: 'preview' }, async () => {
    calls++;
    assert.equal((await inspectLocalNoOrderJournal(d, binding)).operations[0].state, 'unknown');
    return ack;
  });
  await assert.rejects(j.dispatch({ operationId: 'one', stage: 'preview' }, async () => { calls++; return ack; }), /already reserved/);
  assert.equal(calls, 1);
  assert.equal((await inspectLocalNoOrderJournal(d, binding)).operations[0].state, 'acknowledged');
  await assert.rejects(j.complete('one', 'bad'), /completion denied/);
  await j.complete('one', evidence);
  await assert.rejects(j.complete('one', evidence), /completion denied/);
  await j.close(); await j.close();
  await assert.rejects(j.dispatch({ operationId: 'two', stage: 'preview' }, async () => ack), /closed/);
  assert.deepEqual(await inspectLocalNoOrderJournal(d, binding), { closed: true, operations: [{ operationId: 'one', stage: 'preview', state: 'completed', evidenceSha256: evidence }] });
  await assert.rejects(LocalNoOrderJournal.claim(d, binding));
  await assert.rejects(inspectLocalNoOrderJournal(d, 'd'.repeat(64)), /binding mismatch/);
  const u = path.join(root, 'unknown'), uncertain = await LocalNoOrderJournal.claim(u, binding);
  await assert.rejects(uncertain.dispatch({ operationId: 'two', stage: 'base' }, async () => { throw Error('lost response'); }), /unknown/);
  assert.equal((await inspectLocalNoOrderJournal(u, binding)).closed, true);
  assert.equal((await inspectLocalNoOrderJournal(u, binding)).operations[0].state, 'unknown');
  await assert.rejects(uncertain.dispatch({ operationId: 'three', stage: 'base' }, async () => ack), /closed/);
  const f = path.join(root, 'write-failure'), failed = await LocalNoOrderJournal.claim(f, binding);
  const key = createHash('sha256').update('blocked').digest('hex');
  await writeFile(path.join(f, `${key}.reserved.json`), 'partial');
  let dispatched = false;
  await assert.rejects(failed.dispatch({ operationId: 'blocked', stage: 'preview' }, async () => { dispatched = true; return ack; }));
  assert.equal(dispatched, false);
  await assert.rejects(failed.dispatch({ operationId: 'other', stage: 'preview' }, async () => ack), /unavailable/);
  await assert.rejects(inspectLocalNoOrderJournal(f, binding));
  const replaced = path.join(root, 'replaced');
  const oldOwner = await LocalNoOrderJournal.claim(replaced, binding);
  await rename(replaced, `${replaced}-old`);
  const newOwner = await LocalNoOrderJournal.claim(replaced, binding);
  await assert.rejects(oldOwner.close(), /directory changed/);
  await assert.rejects(oldOwner.dispatch({ operationId: 'replaced', stage: 'preview' }, async () => ack), /unavailable/);
  assert.equal((await inspectLocalNoOrderJournal(replaced, binding)).closed, false);
  await newOwner.dispatch({ operationId: 'fresh', stage: 'preview' }, async () => ack);
  await newOwner.close();
  const c = path.join(root, 'crash');
  const child = spawn(process.execPath, ['--import', 'tsx', process.argv[1], '--crash', c], { stdio: 'inherit' });
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(code, 0);
  assert.deepEqual(await inspectLocalNoOrderJournal(c, binding), { closed: false, operations: [{ operationId: 'crashed', stage: 'preview', state: 'unknown' }] });
  await assert.rejects(LocalNoOrderJournal.claim(c, binding));
  const reserve = (await readdir(c)).find(f => f.endsWith('.reserved.json'))!;
  const original = await readFile(path.join(c, reserve), 'utf8');
  await writeFile(path.join(c, reserve), original.slice(0, 8));
  await assert.rejects(inspectLocalNoOrderJournal(c, binding));
  console.log('No-order journal: exclusive claim, durable reservation, unknown acknowledgement, closure, crash and corruption checks passed');
} finally { await rm(root, { recursive: true, force: true }); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
