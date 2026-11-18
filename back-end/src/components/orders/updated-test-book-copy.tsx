'use client';
import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { UpdatedBookCopyResult, inspectUpdatedTestBookCopy } from '@/lib/books/updated-test-book-copy';

type Edition = Awaited<ReturnType<typeof inspectUpdatedTestBookCopy>>;
export function UpdatedTestBookCopy({ orderId }: { orderId: string }) {
  const router = useRouter(), id = useId(), lock = useRef(false), dedicationInitialized = useRef(false);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [dedication, setDedication] = useState('');
  const [created, setCreated] = useState<UpdatedBookCopyResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const endpoint = `/api/admin/orders/${encodeURIComponent(orderId)}/updated-test-copy`;
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Please retry the edition check'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function read(response: Response) {
    const data = await response.json();
    if (!response.ok) throw Error(response.status === 401 ? 'Sign in again, then retry this step.' : typeof data.error === 'string' ? data.error : 'The request could not be confirmed. Retry safely.');
    return data;
  }
  return <section aria-labelledby={`${id}-heading`} aria-busy={busy} className="border-t border-gray-200 pt-4 space-y-3">
    <h4 id={`${id}-heading`} className="text-sm font-semibold text-gray-900">Use the updated book edition</h4>
    <p className="text-sm text-gray-600">Create a separate test book with the latest layout and your accepted images. Keep this order as the original. Printing still requires its separate review.</p>
    {!created && <>
      <button type="button" disabled={busy} onClick={() => void perform(async () => {
        const data: Edition = await read(await fetch(endpoint, { cache: 'no-store' }));
        setEdition(data);
        if (!dedicationInitialized.current) { setDedication(data.dedicationText); dedicationInitialized.current = true; }
      })} className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
        {busy ? 'Working…' : edition ? 'Recheck updated edition' : 'Check updated edition'}
      </button>
      {edition && <div className="space-y-2">
        <p className="text-sm text-gray-700">Updated edition {edition.configVersion} is available.</p>
        <label htmlFor={`${id}-dedication`} className="block text-sm font-medium text-gray-900">Dedication (optional)</label>
        <textarea id={`${id}-dedication`} value={dedication} maxLength={200} disabled={busy} rows={3} onChange={event => setDedication(event.target.value)} aria-describedby={`${id}-count`} className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50" />
        <p id={`${id}-count`} className="text-xs text-gray-500">{dedication.length}/200 characters</p>
        <button type="button" disabled={busy} onClick={() => void perform(async () => {
          const result: UpdatedBookCopyResult = await read(await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedUpdatedAt: edition.updatedAt, configChecksum: edition.configChecksum, dedicationText: dedication }) }));
          setCreated(result);
        })} className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2">{busy ? 'Preparing updated book…' : 'Create updated test book'}</button>
      </div>}
    </>}
    {created && <div className="space-y-3">
      <p role="status" className="text-sm text-gray-700">{created.reused ? 'Your updated test book already exists.' : 'Your updated test book is prepared with the accepted images.'} Open it to review the dedication and progress.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Link className="text-sm font-medium text-blue-700 underline underline-offset-2" href={`/orders/${encodeURIComponent(created.orderId)}`}>Open updated test book</Link>
        {created.canAssemble && <button type="button" disabled={busy} onClick={() => void perform(async () => {
          await read(await fetch(`/api/orders/${encodeURIComponent(created.orderId)}/trigger-book-assembly`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
          router.push(`/orders/${encodeURIComponent(created.orderId)}`);
        })} className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2">{busy ? 'Queueing assembly…' : 'Assemble updated test book'}</button>}
      </div>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
