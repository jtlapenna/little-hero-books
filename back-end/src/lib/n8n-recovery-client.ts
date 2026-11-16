/** Bounded, same-origin n8n reads for workflow inspection and recovery. */
export type N8NExecutionEntry = { id: string; workflowId: string; status: string; startedAt: string; stoppedAt?: string | null; finished: boolean };
export function n8nRecoveryBaseUrl(): string {
  const url = new URL(process.env.N8N_API_URL?.trim() || process.env.N8N_BASE_URL?.trim() || 'https://thepeakbeyond.app.n8n.cloud');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/', '/api/v1', '/api/v1/'].includes(url.pathname)) throw Error('Invalid n8n recovery origin');
  return url.origin;
}
async function read(path: string): Promise<unknown> {
  const key = process.env.N8N_API_KEY?.trim();
  if (!key) throw Error('n8n recovery credentials are unavailable');
  const response = await fetch(n8nRecoveryBaseUrl() + '/api/v1/' + path, {
    headers: { 'X-N8N-API-KEY': key }, redirect: 'error', signal: AbortSignal.timeout(10000), cache: 'no-store',
  });
  if (!response.ok) { await response.body?.cancel(); throw Error(`n8n recovery lookup failed (HTTP ${response.status})`); }
  const reader = response.body?.getReader();
  if (!reader) throw Error('n8n recovery returned no details');
  const parts: Uint8Array[] = []; let size = 0;
  for (;;) {
    const item = await reader.read(); if (item.done) break;
    size += item.value.byteLength;
    if (size > 16 * 1024 * 1024) { await reader.cancel(); throw Error('n8n recovery details exceed the inspection limit'); }
    parts.push(item.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw Error('n8n recovery returned invalid details'); }
}
export async function readN8NExecution(id: string): Promise<unknown> {
  if (!/^\d{1,30}$/.test(id)) throw Error('Invalid n8n execution ID');
  return read(`executions/${id}?includeData=true`);
}
export async function listN8NExecutionPage(limit: number, workflowId?: string | null, cursor?: string): Promise<{ entries: N8NExecutionEntry[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, limit))), includeData: 'false' });
  if (workflowId) query.set('workflowId', workflowId);
  if (cursor) { if (cursor.length > 2048) throw Error('Invalid n8n history cursor'); query.set('cursor', cursor); }
  const result = await read('executions?' + query);
  if (!result || typeof result !== 'object' || !Array.isArray((result as { data?: unknown }).data)) throw Error('Invalid n8n execution list');
  const entries = (result as { data: N8NExecutionEntry[] }).data;
  if (entries.some(entry => !entry || typeof entry.id !== 'string' || !/^\d{1,30}$/.test(entry.id))) throw Error('Invalid n8n execution identity');
  const nextCursor = (result as { nextCursor?: unknown }).nextCursor;
  if (nextCursor != null && typeof nextCursor !== 'string') throw Error('Invalid n8n history cursor');
  return { nextCursor: nextCursor || null, entries: [...entries].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : BigInt(a.id) < BigInt(b.id) ? 1 : 0) };
}
export async function listN8NExecutions(limit: number, workflowId?: string | null): Promise<N8NExecutionEntry[]> {
  return (await listN8NExecutionPage(limit, workflowId)).entries;
}
export async function readN8NWorkflow(id: string): Promise<{ id: string; name: string; active: boolean; isArchived?: boolean }> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw Error('Invalid n8n workflow ID');
  return await read('workflows/' + id) as { id: string; name: string; active: boolean; isArchived?: boolean };
}
