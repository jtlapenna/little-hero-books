'use client';
import { useEffect, useRef, useState } from 'react';
import type { AnyOrdinaryReleasePacket, AnyOrdinaryReleasePermit } from '@/lib/books/gelato-ordinary-release-core';
type Review = { packet: AnyOrdinaryReleasePacket; permit: AnyOrdinaryReleasePermit; packetSha256: string; recipient?: Record<string,string> };
const dollars = (cents: string) => (Number(cents)/100).toFixed(2);
type ReviewProps = { orderId: string; submissionId: string; onRefresh: () => Promise<void> };
export function GelatoReleaseReview(props: ReviewProps) {
 return <ScopedGelatoReleaseReview key={`${props.orderId}:${props.submissionId}`} {...props} />;
}
function ScopedGelatoReleaseReview({ orderId, submissionId, onRefresh }: ReviewProps) {
 const [limit,setLimit]=useState(''),[review,setReview]=useState<Review|null>(null),[approved,setApproved]=useState<string|null>(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[attempted,setAttempted]=useState(false),[now,setNow]=useState(() => Date.now());
 const epoch=useRef(0),flight=useRef(false),abort=useRef<AbortController|null>(null);
 useEffect(()=>{++epoch.current;abort.current?.abort();abort.current=new AbortController();flight.current=false;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{++epoch.current;abort.current?.abort();clearInterval(timer);};},[orderId,submissionId]);
 async function action(kind:'review'|'approve'|'execute') {
  if(flight.current||attempted)return;
  const generation=epoch.current,current=review,permitId=approved,signal=abort.current?.signal;
  if(kind!=='review'&&(!current||Date.parse(current.packet.expiresAt)<=Date.now()))return;
  if(kind==='approve'&&!ack||kind==='execute'&&!permitId)return;
  if(kind==='review'&&!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(limit)){setMessage('Enter the maximum quoted print and shipping subtotal in USD.');return;}
  flight.current=true;setBusy(true);setMessage('');setAck(false);
  if(kind==='execute'){setAttempted(true);setApproved(null);}
  try{
   const [whole,part='']=limit.split('.');
   const body=kind==='review'?{action:kind,submissionId,pricingPolicy:'disclosed_estimate_test_print_v1',maximumQuotedSubtotalCents:(BigInt(whole)*BigInt(100)+BigInt(part.padEnd(2,'0'))).toString()}:kind==='approve'?{action:kind,permit:current!.permit,reviewedPacket:current!.packet,approvedPacketSha256:current!.packetSha256,approveExactOrder:true,acknowledgeFinalChargeMayDiffer:true}:{action:kind,permitId,approvedPacketSha256:current!.packetSha256};
   const response=await fetch('/api/admin/gelato-release',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json();
   if(generation!==epoch.current||signal?.aborted)return;
   if(!response.ok||result.state==='blocked'){setReview(null);setApproved(null);throw Error(result.blockers?.length?'Print release is held until this exact test order and printer account are activated.':result.error||'Release was not confirmed. Reload print status before another action.');}
   if(kind==='review'){if(result.state!=='review_required'||result.packet?.version!==3||!result.recipient)throw Error('Current print review is unavailable.');setReview(result);setApproved(null);}
   else if(kind==='approve'){if(result.state!=='approved'||result.packetSha256!==current!.packetSha256)throw Error('Exact approval was not confirmed.');setApproved(result.permitId);setMessage('Exact print approval recorded. Release remains a separate action.');}
   else{setReview(null);setMessage(result.state==='converted'?'Gelato confirmed the print release.':'Release outcome is unconfirmed. Reload print status; do not submit another order.');await onRefresh();}
  }catch(e){if(generation===epoch.current&&!signal?.aborted){setReview(null);setApproved(null);setMessage(e instanceof Error?e.message:'Print release unavailable.');}}
  finally{if(generation===epoch.current&&!signal?.aborted){flight.current=false;setBusy(false);}}
 }
 const packet=review?.packet,expired=!packet||Date.parse(packet.expiresAt)<=now,estimate=packet?.version===3?packet.estimate:null;
 return <section className="space-y-4 rounded-lg border border-gray-300 bg-white p-4 text-gray-900" aria-label="Print release approval">
  <h3 className="font-semibold text-gray-900">Release this book to printing</h3>
  <p className="text-sm text-gray-700">Review a fresh quote, record your exact approval, then release this one book. The provider may charge your Gelato account.</p>
  <label className="block text-sm font-medium">Maximum quoted print + shipping subtotal (USD)<input className="mt-1 block w-48 rounded-md border border-gray-400 bg-white px-3 py-2" inputMode="decimal" value={limit} disabled={busy||attempted} onChange={e=>{setLimit(e.target.value);setReview(null);setApproved(null);setAck(false);}} /></label>
  {message&&<p role="status" className="text-sm text-amber-900">{message}</p>}
  {review&&estimate&&<><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-medium">Ship to</dt><dd>{review.recipient?.firstName} {review.recipient?.lastName}<br />{review.recipient?.addressLine1}{review.recipient?.addressLine2 && <><br />{review.recipient.addressLine2}</>}<br />{review.recipient?.city}, {review.recipient?.state} {review.recipient?.postCode}<br />{review.recipient?.country}</dd></div><div><dt className="font-medium">Quantity and service</dt><dd>1 copy · {packet!.shipmentMethodUid}</dd><dt className="mt-2 font-medium">Fresh quote (USD)</dt><dd>Print: ${dollars(estimate.productsCents)}<br />Shipping: ${dollars(estimate.shippingCents)}<br />Quoted subtotal: ${dollars(estimate.quotedSubtotalCents)}<br />Taxes, fees and final total: unknown</dd></div></dl>
   <p className="text-sm text-gray-700">Final charges may differ. This limit applies to the quoted subtotal; Gelato does not enforce it as a final charge cap.</p>
   <ul className="space-y-1 text-xs text-gray-600">{packet!.artifacts.map(file=><li key={file.key} className="break-all">{file.bookId} · {file.formatId} · version {file.configVersion} · {file.pdfPageCount} PDF pages<br />PDF SHA-256: {file.sha256}</li>)}</ul>
   <p className="break-all text-xs text-gray-600">Provider order: {packet!.providerOrderId}<br />Account: {packet!.accountSha256}<br />Review: {review.packetSha256}<br />Expires: {new Date(packet!.expiresAt).toLocaleString()}</p>
   {expired&&<p role="status" className="text-sm text-amber-900">Review expired. Obtain a fresh review.</p>}
   {!approved&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ack} disabled={busy||expired} onChange={e=>setAck(e.target.checked)} /><span>I approve this exact book, recipient and quoted subtotal, and acknowledge that the final charge may differ.</span></label>}
  </>}
  <div className="flex flex-wrap gap-3"><button className="rounded-md border border-gray-400 bg-white px-3 py-2 text-sm disabled:opacity-50" disabled={busy||attempted} onClick={()=>void action('review')}>Review fresh print quote</button>
   {review&&!approved&&<button className="rounded-md bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy||expired||!ack} onClick={()=>void action('approve')}>Record exact print approval</button>}
   {approved&&<button className="rounded-md bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy||expired||attempted} onClick={()=>void action('execute')}>Release this book to printing</button>}</div>
 </section>;
}
