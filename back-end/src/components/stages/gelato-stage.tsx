'use client';

import { useEffect, useRef, useState } from 'react';
import type { Order } from '@/types/order';
import { gelatoStatusLabel } from '@/lib/books/gelato-status';

type Inspection = { submissionId: string | null; state: string; canRefresh: boolean; canRecover: boolean; canCancel?: boolean;
  orders: Array<{ id: string; status: string; orderType: string; actionReason: string | null }>;
  notifications?: Array<{ id: string; notification_type: string; delivery_state: string; attempt_result: string | null }>;
  items: Array<{ active?: boolean; orderId: string; status: string; actionReason: string | null }> };

export function GelatoStage({ order, onRefresh }: { order: Order; onRefresh: () => Promise<void> }) {
  const [details, setDetails] = useState<Inspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const [cancelResults, setCancelResults] = useState<Array<{ providerOrderId: string; verifiedStatus: string | null }>>([]);
  const url = `/api/admin/gelato-print?orderId=${encodeURIComponent(order.orderId)}`;
  useEffect(() => {
    const controller = new AbortController();
    setDetails(null); setError(''); setMessage('');
    fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Print details unavailable. Reload to try again.');
      setDetails(await response.json());
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [url]);
  async function update(action: 'refresh' | 'recover' | 'reload' | 'cancel') {
    setBusy(true); setError(''); setMessage(''); setCancelResults([]);
    let resultMessage = '';
    try {
      if (action !== 'reload') {
        const response = await fetch('/api/admin/gelato-print', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.orderId, action }) });
        if (!response.ok) throw new Error('Gelato update was not confirmed. Reload details before retrying.');
        const result = await response.json();
        if (action === 'cancel') {
          setCancelResults(result.providerOrders ?? []);
          resultMessage = result.canceled ? 'All connected print orders are confirmed canceled.' : 'Cancellation is incomplete or unconfirmed. Review each order below.';
        } else if (result.needsAttention) resultMessage = 'Gelato details updated. Review is still needed.';
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error('Print details unavailable. Reload to try again.');
      setDetails(await response.json());
      await onRefresh();
      setMessage(resultMessage || (action === 'reload' ? 'Details reloaded.' : 'Gelato details updated.'));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Print update failed.'); }
    finally { setBusy(false); }
  }
  const tracking = order.gelatoTracking ?? [];
  return <section className="space-y-5" aria-label="Gelato print status">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-gray-900">Gelato print status</h2>
        <p className="mt-1 text-sm text-gray-600">{gelatoStatusLabel(order.gelatoStatus, order.gelatoOrderType, order.gelatoActionReason)}</p></div>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-md border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50" disabled={busy} onClick={() => update('reload')}>Reload details</button>
        {details?.canRefresh && <button className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50" disabled={busy} onClick={() => update('refresh')}>{busy ? 'Updating…' : 'Refresh Gelato status'}</button>}
        {details?.canCancel && <button className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-50" disabled={busy} onClick={() => dialog.current?.showModal()}>Cancel print group</button>}
        {details?.canRecover && <button className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50" disabled={busy} onClick={() => update('recover')}>Check submission outcome</button>}
      </div>
    </div>
    <dialog ref={dialog} className="max-w-sm rounded-lg p-5 shadow-lg backdrop:bg-black/40" aria-labelledby="gelato-cancel-heading">
      <h3 id="gelato-cancel-heading" className="font-semibold">Cancel this print group?</h3>
      <p className="mt-2 text-sm text-gray-600">This requests cancellation of all {details?.orders.length ?? 0} connected print orders. Each result must be confirmed by Gelato.</p>
      <div className="mt-4 flex flex-wrap gap-3"><button autoFocus className="rounded-md border px-3 py-2 text-sm" onClick={() => dialog.current?.close()}>Keep printing</button>
      <button className="rounded-md bg-red-700 px-3 py-2 text-sm text-white" onClick={() => { dialog.current?.close(); void update('cancel'); }}>Request cancellation</button></div>
    </dialog>
    {cancelResults.length > 0 && <ul className="space-y-2 text-sm" aria-label="Cancellation results">{cancelResults.map((result) => <li key={result.providerOrderId} className="break-all">{result.providerOrderId}: {result.verifiedStatus === 'canceled' ? 'Confirmed canceled' : `Not confirmed canceled (${result.verifiedStatus ?? 'status unavailable'})`}</li>)}</ul>}
    {order.gelatoOrderType === 'draft' && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Draft saved for review. Printing has not started.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-gray-600">{message}</p>}
    {!details && !error && <p role="status" className="text-sm text-gray-600">Loading print details…</p>}
    {details && details.orders.length === 0 && <p className="text-sm text-gray-600">{details.state === 'not_submitted' ? 'No Gelato submission yet.' : 'Provider acceptance is not confirmed. Check the saved submission before creating another draft.'}</p>}
    {details?.orders.map((entry) => <div key={entry.id} className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-medium text-gray-900">{gelatoStatusLabel(entry.status, entry.orderType, entry.actionReason)}</p>
      <p className="mt-1 break-all text-xs text-gray-500">{entry.id}</p>
      {entry.actionReason && entry.actionReason !== 'awaiting_draft_review' && <p className="mt-2 text-sm text-amber-800">Provider state needs review. Refresh before taking further action.</p>}
    </div>)}
    {details && details.items.length > 1 && <div><h3 className="text-sm font-medium">Books in this submission</h3><ul className="mt-2 space-y-2 text-sm">
      {details.items.map((item) => <li key={item.orderId} className="flex flex-wrap justify-between gap-2">{item.active !== false ? <a className="break-all text-blue-700 underline" href={`/orders/${encodeURIComponent(item.orderId)}`}>{item.orderId}</a> : <span className="break-all">{item.orderId} (archived)</span>}<span>{item.actionReason && item.actionReason !== 'awaiting_draft_review' ? 'Needs review' : item.status === 'draft' ? 'Draft awaiting review' : item.status ?? 'Awaiting provider'}</span></li>)}
    </ul></div>}
    {details?.notifications && details.notifications.length > 0 && <div><h3 className="text-sm font-medium">Customer notifications</h3><ul className="mt-2 space-y-2 text-sm">
      {details.notifications.map((notification) => <li key={notification.id}>{notification.notification_type.startsWith('notification-review:') ? 'Notification review' : notification.notification_type.includes('shipped') ? 'Shipping notice' : 'Printing notice'}: {notification.delivery_state === 'delivered' ? 'Sent' : notification.delivery_state === 'suppressed' ? 'Skipped after status changed' : ['held', 'ambiguous'].includes(notification.delivery_state) ? 'Needs delivery review' : 'Not sent'}</li>)}
    </ul></div>}
    {tracking.length > 0 && <div><h3 className="text-sm font-medium">Packages for this book</h3><ul className="mt-2 space-y-2 text-sm">
      {tracking.map((parcel) => <li key={`${parcel.providerOrderId}:${parcel.packageId}`} className="break-all">{parcel.carrier} {parcel.trackingNumber} {/^https?:\/\//.test(parcel.trackingUrl) && <a className="ml-2 text-blue-700 underline" href={parcel.trackingUrl} target="_blank" rel="noopener noreferrer">Track package</a>}</li>)}
    </ul></div>}
  </section>;
}
