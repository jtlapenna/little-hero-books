import type { NormalizedW0Manifest } from './normalize-w0-manifest';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function declaredRecord(value: unknown): JsonRecord | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isRecord(value)) throw new Error('W2A character specs identity is malformed');
  return Object.keys(value).length ? value : null;
}

function declaredString(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim()) throw new Error('W2A character hash identity is malformed');
  return value.trim();
}

export function reconcileFrozenW2AInput(body: JsonRecord, snapshot: NormalizedW0Manifest): JsonRecord {
  const orderContext = isRecord(body.orderContext) ? body.orderContext : {};
  const frozenSpecs = snapshot.characterSpecs;
  const frozenHash = snapshot.characterHash;
  const configured = snapshot.schema === 'lhb.run-manifest@v3' &&
    (snapshot.bookId === 'book-finding-our-inner-voice' || snapshot.provider === 'gelato');
  if (configured && (!Object.keys(frozenSpecs).length || !frozenHash)) {
    throw new Error('Configured W2A requires frozen W0 character specs and hash');
  }
  if (Object.keys(frozenSpecs).length) {
    for (const context of [body, orderContext]) {
      for (const field of ['characterSpecs', 'character_specs']) {
        const declared = declaredRecord(context[field]);
        if (declared && stableJson(declared) !== stableJson(frozenSpecs)) {
          throw new Error('Frozen W0 character specs identity does not match W2A request');
        }
      }
    }
  }
  if (frozenHash) {
    for (const context of [body, orderContext]) {
      for (const field of ['characterHash', 'character_hash']) {
        const declared = declaredString(context[field]);
        if (declared && declared !== frozenHash) {
          throw new Error('Frozen W0 character hash identity does not match W2A request');
        }
      }
    }
  }
  const childName = typeof frozenSpecs.childName === 'string' && frozenSpecs.childName.trim()
    ? frozenSpecs.childName.trim()
    : typeof frozenSpecs.name === 'string' && frozenSpecs.name.trim()
      ? frozenSpecs.name.trim()
      : undefined;
  if (childName) {
    for (const context of [body, orderContext]) {
      const declared = context.childName;
      if (typeof declared === 'string' && declared.trim() && declared.trim() !== childName) {
        throw new Error('Frozen W0 child name identity does not match W2A request');
      }
    }
  }
  return {
    ...body,
    ...(Object.keys(frozenSpecs).length ? { characterSpecs: frozenSpecs, character_specs: frozenSpecs } : {}),
    ...(Object.keys(snapshot.bookSpecs).length ? { bookSpecs: snapshot.bookSpecs, book_specs: snapshot.bookSpecs } : {}),
    ...(frozenHash ? { characterHash: frozenHash, character_hash: frozenHash } : {}),
    ...(childName ? { childName } : {}),
  };
}
