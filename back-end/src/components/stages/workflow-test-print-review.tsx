'use client';
import { useEffect, useRef, useState } from 'react';
import type { GelatoMonetaryQuote } from '@/lib/books/gelato-financial-observation';
type Review = { state: 'operator_review'; orderId: string; submissionId: string; packetSha256: string; expiresAt: string;
  recipient: { firstName: string; lastName: string; addressLine1: string; addressLine2?: string; city: string; state: string; postCode: string; country: string; email: string };
  pdfUrl: string; quantity: number; productUid: string; service: string; accountSha256: string; quote: GelatoMonetaryQuote | null;
  artifacts: Array<{ key: string; sha256: string; pageCount: number; orderId: string }>; canSubmit: boolean; submissionEnabled: boolean };
type ReviewProps = { orderId: string; submissionId: string; onRefresh: () => Promise<void> };
export function WorkflowTestPrintReview(props: ReviewProps) {
 return <ScopedWorkflowTestPrintReview key={`${props.orderId}:${props.submissionId}`} {...props} />;
}
function ScopedWorkflowTestPrintReview({ orderId, submissionId, onRefresh }: ReviewProps) {
 const [review, setReview] = useState<Review | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [attempted, setAttempted] = useState(false), [ack, setAck] = useState(false), [time, setTime] = useState(() => Date.now());
 const inFlight = useRef(false), epoch = useRef(0), controller = useRef<AbortController | null>(null);
 useEffect(() => {
   const generation = ++epoch.current, abort = new AbortController(); controller.current = abort;
   inFlight.current = false;
   fetch(`/api/admin/workflow-test-print?orderId=${encodeURIComponent(orderId)}`, { signal: abort.signal }).then(async r => {
     if (!r.ok) throw Error('Refresh the print quote to create a current review.');
     const body = await r.json(); if (generation === epoch.current && !abort.signal.aborted) setReview(body);
   }).catch(e => { if (generation === epoch.current && !abort.signal.aborted) setError(e.message); });
   const timer = setInterval(() => setTime(Date.now()), 1000);
   return () => { ++epoch.current; abort.abort(); clearInterval(timer); };
 }, [orderId, submissionId]);
 async function act(action: 'review' | 'submit') {
   if (inFlight.current || attempted) return;
   const generation = epoch.current, packet = review?.packetSha256, abort = controller.current;
   if (action === 'submit' && (!review || !ack || !review.canSubmit || Date.parse(review.expiresAt) <= Date.now())) return;
   if (action === 'submit') setAttempted(true);
   inFlight.current = true; setBusy(true); setError(''); setAck(false); setReview(null);
   try {
     const response = await fetch('/api/admin/workflow-test-print', { method: 'POST', signal: abort?.signal, headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(action === 'review' ? { action, orderId } : { action, orderId, packetSha256: packet, acknowledgePossibleCharge: true, approveExactBookAndRecipient: true }) });
     const body = await response.json();
     if (generation !== epoch.current || abort?.signal.aborted) return;
     if (!response.ok) throw Error(body.error || 'Print action was not confirmed. Reload print status.');
     if (action === 'review') setReview(body); else await onRefresh();
   } catch (e) { if (generation === epoch.current && !abort?.signal.aborted) setError(e instanceof Error ? e.message : 'Print action failed.'); }
   finally { if (generation === epoch.current && !abort?.signal.aborted) { inFlight.current = false; setBusy(false); } }
 }
 const expired = !review || Date.parse(review.expiresAt) <= time;
 const money = review?.quote, shipping = money?.shippingOptions.find(s => s.shipmentMethodUid === review?.service);
 return <section className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-gray-900" aria-label="Prepared print review">
  <div><h3 className="font-semibold text-gray-900">{attempted ? 'Print submission needs confirmation' : 'Print file prepared'}</h3><p className="mt-1 text-sm text-gray-700">{attempted ? 'A submission may have reached Gelato. Reload print status before any further action.' : 'No order has been sent to Gelato. Review the book, recipient and current quote before submission.'}</p></div>
  {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  {review && <>
   <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-medium">Ship to</dt><dd>{review.recipient.firstName} {review.recipient.lastName}<br />{review.recipient.addressLine1}{review.recipient.addressLine2 && <><br />{review.recipient.addressLine2}</>}<br />{review.recipient.city}, {review.recipient.state} {review.recipient.postCode}<br />{review.recipient.country}<br />{review.recipient.email}</dd></div>
    <div><dt className="font-medium">Quantity and shipping</dt><dd>{review.quantity} book · {shipping?.name || review.service}</dd><dt className="mt-2 font-medium">Quoted amounts ({money?.currency || 'USD'})</dt><dd>Print: {money?.products.map(p => p.price ?? 'unavailable').join(', ') || 'unavailable'}<br />Shipping: {shipping?.price ?? 'unavailable'}<br />Taxes and final fees: not confirmed</dd></div></dl>
   <ul className="space-y-2 text-sm">{review.artifacts.map(file => <li key={file.key}><a className="font-medium text-blue-800 underline" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" href={review.pdfUrl}>Open prepared PDF ({file.pageCount} pages)</a><p className="mt-1 break-all text-xs text-gray-600">SHA-256: {file.sha256}</p></li>)}</ul>
   <details className="text-xs text-gray-600"><summary>Review identity</summary><p className="mt-2 break-all">Account: {review.accountSha256}<br />Review: {review.packetSha256}<br />Expires: {new Date(review.expiresAt).toLocaleString()}</p></details>
   {expired && <p role="status" className="text-sm text-amber-900">This review expired. Refresh the quote and review it again.</p>}
   {!review.submissionEnabled && <p className="text-sm text-amber-900">Submission remains held until this exact test order and printer account are activated.</p>}
   <label className="flex items-start gap-2 text-sm text-gray-800"><input type="checkbox" className="mt-1" checked={ack} disabled={busy || expired || !review.canSubmit} onChange={e => setAck(e.target.checked)} /><span>I approve this exact book and recipient. Sending it to Gelato may start fulfillment and incur a charge. The final charge may differ from this quote.</span></label>
  </>}
  {attempted && <button className="rounded-md border border-gray-400 bg-white px-3 py-2 text-sm" disabled={busy} onClick={() => void onRefresh()}>Reload print status</button>}
  <div className="flex flex-wrap gap-3"><button className="rounded-md border border-gray-400 bg-white px-3 py-2 text-sm disabled:opacity-50" disabled={busy || attempted} onClick={() => void act('review')}>{busy ? 'Working…' : 'Refresh quote for review'}</button>
   <button className="rounded-md bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy || !ack || expired || !review?.canSubmit} onClick={() => void act('submit')}>Submit this print test to Gelato</button></div>
 </section>;
}
