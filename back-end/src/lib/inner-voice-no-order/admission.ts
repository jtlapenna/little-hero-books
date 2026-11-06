/** Local, in-memory admission prototype. This is not a hosted authorization boundary. */
export const stageEndpoints = Object.freeze({
  intake: '/api/internal/w0/upsert-order',
  freeze: '/api/internal/w0/build-manifest',
  base: '/api/internal/w2a/build-base-input',
  pose: '/api/internal/w2a/build-pose-input',
  normalize: '/api/internal/w2b/build-pose-input',
  preview: '/api/internal/w3/render-preview-document',
} as const);

export type Stage = keyof typeof stageEndpoints;
export type Identity = {
  scopeId: string; rootId: string; memberId: string; childId: string;
  bookId: string; version: number; format: 'standard' | 'amazon';
  configSha256: string; artifactPrefix: string;
};
export type Scope = {
  identity: Identity; startsAtMs: number; expiresAtMs: number;
  generationInputDispatchLimit: number; previewDispatchLimit: number; totalDispatchLimit: number;
};
export type Request = { identity: Identity; stage: string; endpoint: string; operationId: string };
export type Adapter = { [K in Stage]: (identity: Readonly<Identity>, operationId: string) => Promise<void> };

const identityKeys: (keyof Identity)[] = ['scopeId', 'rootId', 'memberId', 'childId', 'bookId', 'version', 'format', 'configSha256', 'artifactPrefix'];
const safeId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const maxLifetimeMs = 60 * 60 * 1000;
const maxBudget = 10000;

function validIdentity(i: Identity): boolean {
  return !!i && ['scopeId', 'rootId', 'memberId', 'childId', 'bookId'].every(k =>
    typeof i[k as keyof Identity] === 'string' && safeId.test(i[k as keyof Identity] as string)) &&
    i.scopeId.startsWith('test-') && i.rootId.startsWith('test-') && i.memberId.startsWith('test-') && i.childId.startsWith('test-') &&
    Number.isSafeInteger(i.version) && i.version > 0 && (i.format === 'standard' || i.format === 'amazon') &&
    typeof i.configSha256 === 'string' && /^[a-f0-9]{64}$/.test(i.configSha256) &&
    i.artifactPrefix === `no-order/${i.scopeId}/${i.rootId}/${i.memberId}/${i.childId}/`;
}

function validBudget(n: number): boolean { return Number.isSafeInteger(n) && n >= 0 && n <= maxBudget; }

/**
 * The adapter is injected, and must itself be trusted. Counters limit calls to
 * selected input and preview adapters in this instance only. W2A input calls are
 * not provider generations, and these counters cannot enforce provider budgets.
 * Instances do not share reservations or verify ownership. Closing the instance
 * prevents future dispatch but does not cancel an adapter already in flight.
 * This does not enforce network isolation, provider suppression, or durable budgets.
 */
export class LocalNoOrderAdmission {
  private readonly scope: Readonly<Scope>;
  private readonly identity: Readonly<Identity>;
  private readonly used = new Set<string>();
  private generationInputs = 0;
  private previews = 0;
  private attempts = 0;
  private closed = false;

  constructor(scope: Scope, private readonly adapter: Adapter, private readonly now: () => number) {
    if (!scope || !validIdentity(scope.identity) || !Number.isSafeInteger(scope.startsAtMs) ||
        !Number.isSafeInteger(scope.expiresAtMs) || scope.expiresAtMs <= scope.startsAtMs ||
        scope.expiresAtMs - scope.startsAtMs > maxLifetimeMs ||
        !validBudget(scope.generationInputDispatchLimit) || !validBudget(scope.previewDispatchLimit) ||
        !validBudget(scope.totalDispatchLimit) || scope.totalDispatchLimit === 0) throw new Error('invalid scope');
    this.identity = Object.freeze({ ...scope.identity });
    this.scope = Object.freeze({ ...scope, identity: this.identity });
  }

  async dispatch(request: Request): Promise<void> {
    try {
      const now = this.now();
      if (this.closed || !Number.isSafeInteger(now) || now < this.scope.startsAtMs || now >= this.scope.expiresAtMs) throw new Error('scope closed or outside time window');
      if (!request || !validIdentity(request.identity) || identityKeys.some(key => request.identity[key] !== this.identity[key])) throw new Error('identity mismatch');
      if (typeof request.stage !== 'string' || !Object.prototype.hasOwnProperty.call(stageEndpoints, request.stage)) throw new Error('stage denied');
      const stage = request.stage as Stage;
      if (request.endpoint !== stageEndpoints[stage]) throw new Error('endpoint denied');
      if (typeof request.operationId !== 'string' || !safeId.test(request.operationId) || this.used.has(request.operationId)) throw new Error('invalid or repeated operation');
      const generationInput = stage === 'base' || stage === 'pose' ? 1 : 0;
      const preview = stage === 'preview' ? 1 : 0;
      if (this.attempts + 1 > this.scope.totalDispatchLimit || this.generationInputs + generationInput > this.scope.generationInputDispatchLimit || this.previews + preview > this.scope.previewDispatchLimit) throw new Error('dispatch limit exceeded');
      if (typeof this.adapter?.[stage] !== 'function') throw new Error('adapter missing');
      // Reserve before awaiting. A failure or unknown acknowledgement closes the scope.
      this.used.add(request.operationId);
      this.attempts++;
      this.generationInputs += generationInput;
      this.previews += preview;
      await this.adapter[stage](this.identity, request.operationId);
    } catch (error) {
      this.closed = true;
      throw error;
    }
  }

  close(): void { this.closed = true; }
}
