import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const hash = /^[a-f0-9]{64}$/;
const safeId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
type Operation = { operationId: string; stage: string };
type RecordState = 'reserved' | 'acknowledged' | 'unknown' | 'completed';
type Entry = Operation & { state: RecordState; evidenceSha256?: string };

function operationKey(operationId: string): string {
  return createHash('sha256').update(operationId, 'utf8').digest('hex');
}
function assertOperation(operation: Operation): void {
  if (!operation || typeof operation.operationId !== 'string' || !safeId.test(operation.operationId) ||
      typeof operation.stage !== 'string' || !safeId.test(operation.stage)) throw Error('invalid operation identity');
}
async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function writeOnce(directory: string, name: string, value: unknown): Promise<void> {
  const handle = await open(path.join(directory, name), 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await syncDirectory(directory);
}

/**
 * One owner per new local directory. It is never reopened for writing. A crash
 * or failed write permanently prevents replay; inspection is read-only. This
 * journal does not enforce a hosted scope, cancel in-flight calls, or establish
 * provider reconciliation. Path identity checks detect replacement but are not
 * atomic with writes or dispatch. The directory and its parent must be trusted
 * against concurrent mutation. Cross-run ownership and deduplication require a
 * trusted durable registry. The caller must enforce authorization and deadlines.
 */
export class LocalNoOrderJournal {
  private readonly entries = new Map<string, Entry>();
  private tail: Promise<void> = Promise.resolve();
  private closed = false;
  private poisoned = false;

  private constructor(private readonly directory: string, private readonly device: bigint, private readonly inode: bigint) {}

  private async checkDirectory(): Promise<void> {
    try {
      const current = await lstat(this.directory, { bigint: true });
      if (!current.isDirectory() || current.dev !== this.device || current.ino !== this.inode) throw Error('journal directory changed');
    } catch (error) { this.poisoned = true; throw error; }
  }

  static async claim(directory: string, bindingSha256: string): Promise<LocalNoOrderJournal> {
    if (typeof bindingSha256 !== 'string' || !hash.test(bindingSha256)) throw Error('invalid journal binding');
    await mkdir(directory, { mode: 0o700 });
    const identity = await lstat(directory, { bigint: true });
    if (!identity.isDirectory()) throw Error('journal directory changed');
    const journal = new LocalNoOrderJournal(directory, identity.dev, identity.ino);
    await syncDirectory(path.dirname(directory));
    await journal.checkDirectory();
    await writeOnce(directory, 'binding.json', { version: 1, bindingSha256 });
    await journal.checkDirectory();
    return journal;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async record(operation: Operation, state: RecordState, evidenceSha256?: string): Promise<void> {
    try {
      await this.checkDirectory();
      await writeOnce(this.directory, `${operationKey(operation.operationId)}.${state}.json`,
        { ...operation, state, ...(evidenceSha256 ? { evidenceSha256 } : {}) });
      await this.checkDirectory();
    } catch (error) { this.poisoned = true; throw error; }
  }

  /** The callback may return only a hash of its acknowledgement, not completion. */
  dispatch(operation: Operation, callback: () => Promise<string>): Promise<void> {
    return this.exclusive(async () => {
      if (this.closed || this.poisoned) throw Error('journal closed or unavailable');
      assertOperation(operation);
      if (this.entries.has(operation.operationId)) throw Error('operation already reserved');
      const op = Object.freeze({ operationId: operation.operationId, stage: operation.stage });
      await this.record(op, 'reserved');
      this.entries.set(op.operationId, { ...op, state: 'reserved' });
      try {
        await this.checkDirectory();
        const acknowledgement = await callback();
        if (typeof acknowledgement !== 'string' || !hash.test(acknowledgement)) throw Error('invalid acknowledgement');
        await this.record(op, 'acknowledged', acknowledgement);
        this.entries.set(op.operationId, { ...op, state: 'acknowledged', evidenceSha256: acknowledgement });
      } catch {
        this.closed = true;
        if (!this.poisoned) {
          await this.record(op, 'unknown');
          this.entries.set(op.operationId, { ...op, state: 'unknown' });
          await this.writeClosed('unknown');
        }
        throw Error('operation acknowledgement unknown; no automatic retry');
      }
    });
  }

  /** Completion evidence is supplied by the caller and is not provider reconciliation. */
  complete(operationId: string, evidenceSha256: string): Promise<void> {
    return this.exclusive(async () => {
      if (this.closed || this.poisoned) throw Error('journal closed or unavailable');
      const entry = this.entries.get(operationId);
      if (!entry || entry.state !== 'acknowledged' || typeof evidenceSha256 !== 'string' || !hash.test(evidenceSha256)) throw Error('completion denied');
      await this.record(entry, 'completed', evidenceSha256);
      this.entries.set(operationId, { operationId: entry.operationId, stage: entry.stage, state: 'completed', evidenceSha256 });
    });
  }

  private async writeClosed(reason: 'requested' | 'unknown'): Promise<void> {
    try {
      await this.checkDirectory();
      await writeOnce(this.directory, 'closed.json', { reason });
      await this.checkDirectory();
    }
    catch (error) { this.poisoned = true; throw error; }
  }
  close(): Promise<void> {
    return this.exclusive(async () => {
      if (this.poisoned) throw Error('journal unavailable');
      if (this.closed) return;
      this.closed = true;
      await this.writeClosed('requested');
    });
  }
}

/** Read-only recovery. A reservation without a recorded acknowledgement is unknown. */
export async function inspectLocalNoOrderJournal(directory: string, bindingSha256: string): Promise<{ closed: boolean; operations: Entry[] }> {
  if (typeof bindingSha256 !== 'string' || !hash.test(bindingSha256)) throw Error('invalid journal binding');
  const names = await readdir(directory);
  const binding = JSON.parse(await readFile(path.join(directory, 'binding.json'), 'utf8'));
  if (JSON.stringify(binding) !== JSON.stringify({ version: 1, bindingSha256 })) throw Error('journal binding mismatch');
  const byKey = new Map<string, Map<RecordState, Entry>>();
  for (const name of names) {
    if (name === 'binding.json') continue;
    if (name === 'closed.json') {
      const closed = JSON.parse(await readFile(path.join(directory, name), 'utf8'));
      if (JSON.stringify(closed) !== JSON.stringify({ reason: 'requested' }) && JSON.stringify(closed) !== JSON.stringify({ reason: 'unknown' })) throw Error('invalid closure');
      continue;
    }
    const match = /^([a-f0-9]{64})\.(reserved|acknowledged|unknown|completed)\.json$/.exec(name);
    if (!match) throw Error('unexpected journal file');
    const entry = JSON.parse(await readFile(path.join(directory, name), 'utf8')) as Entry;
    assertOperation(entry);
    const state = match[2] as RecordState;
    if (operationKey(entry.operationId) !== match[1] || entry.state !== state ||
        JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify((state === 'acknowledged' || state === 'completed' ? ['evidenceSha256', 'operationId', 'stage', 'state'] : ['operationId', 'stage', 'state']).sort()) ||
        ((state === 'acknowledged' || state === 'completed') && (typeof entry.evidenceSha256 !== 'string' || !hash.test(entry.evidenceSha256)))) throw Error('invalid journal entry');
    const events = byKey.get(match[1]) ?? new Map<RecordState, Entry>();
    events.set(state, entry); byKey.set(match[1], events);
  }
  const operations: Entry[] = [];
  for (const events of byKey.values()) {
    const reserved = events.get('reserved');
    if (!reserved || [...events.values()].some(e => e.operationId !== reserved.operationId || e.stage !== reserved.stage) ||
        (events.has('unknown') && (events.has('acknowledged') || events.has('completed'))) ||
        (events.has('completed') && !events.has('acknowledged'))) throw Error('invalid journal history');
    operations.push(events.get('completed') ?? events.get('unknown') ?? events.get('acknowledged') ?? { ...reserved, state: 'unknown' });
  }
  return { closed: names.includes('closed.json'), operations };
}
