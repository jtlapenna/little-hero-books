import React from 'react';
import type { GelatoPrintInspection } from '@/lib/books/gelato-admin-inspection';

function time(value?: string | null) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded'; }
function amount(value?: string | null, currency?: string | null) { return value === null || value === undefined ? 'Not reported' : `${currency ?? 'Unknown currency'} ${value}`; }
export function GelatoObservationDetails({ details }: { details: GelatoPrintInspection }) {
  const polling = details.polling, quote = details.monetaryQuote;
  const method = quote?.shippingOptions.find(option => option.shipmentMethodUid === quote.selectedShipmentMethodUid);
  return <div className="space-y-4 text-sm text-gray-700" aria-label="Gelato checks and fulfillment costs">
    <div>
      <h3 className="font-medium text-gray-900">Status checks</h3>
      <p>Automatic checks: {polling?.enabled ? 'Enabled' : 'Off'}{polling?.monitoringComplete ? ' · Follow-up period ended' : ''}</p>
      <p>Last completed provider check: {time(polling?.lastSuccessfulCheckAt)}</p>
      {polling?.lastAttemptAt && <p>Last attempt: {time(polling.lastAttemptAt)}{polling.lastResult === 'failed' ? ' · Failed; last known status retained' : polling.lastResult === 'requires_review' ? ' · Needs review' : ''}</p>}
      {polling?.enabled && !polling.monitoringComplete && <p>Next check due: {time(polling.nextAttemptAt)}</p>}
      {polling?.stale && <p role="status" className="text-amber-800">Status checks are overdue. Use refresh or investigate the scheduler.</p>}
    </div>
    {details.orders.map(entry => <div key={entry.id}>
      <p className="break-all font-medium">Provider order {entry.id}</p>
      <p>Provider updated: {time(entry.updatedAt)}</p><p>Last accepted status check: {time(entry.lastCheckedAt)}</p>
      <p>Payment status: {entry.financial?.status ?? 'Not recorded'}</p>
      <p>Financial data checked: {time(entry.financialObservedAt)}</p>
      {(entry.financialActionReason || entry.financial?.reviewReason) && <p className="text-amber-800">Financial information needs review. The last recorded figures may be incomplete.</p>}
      {entry.financial?.receipts === null || !entry.financial ? <p>Provider receipts: Not observed</p> :
        entry.financial.receipts.length === 0 ? <p>Provider returned no receipts.</p> : <ul className="mt-1 space-y-1" aria-label="Provider receipts">
          {entry.financial.receipts.slice(-3).map((receipt, index) => <li key={receipt.id ?? index}>Provider receipt total: {amount(receipt.amounts.totalInclVat ?? receipt.amounts.total, receipt.currency)}
            {receipt.isCalculated === true ? ' · Calculated estimate' : receipt.isCalculated === false ? '' : ' · Estimate status not reported'}</li>)}
          {entry.financial.receipts.length > 3 && <li>Showing the latest 3 of {entry.financial.receipts.length} recorded receipts.</li>}
        </ul>}
      {entry.financial && <p>Processed files reported: {entry.financial.processedFiles.filter(file => file.present).length} of {entry.financial.processedFiles.length}</p>}
    </div>)}
    <div><h3 className="font-medium text-gray-900">Saved fulfillment quote</h3>
      {quote ? <>
        <p>Quoted: {time(quote.quotedAt)}</p>
        <ul className="mt-1 space-y-1">{quote.products.map(product => <li key={product.itemReferenceId}>Book item {product.itemReferenceId}: quantity {product.quantity}, line price {amount(product.price, product.currency)}</li>)}</ul>
        <p>Selected shipping: {method?.name ?? quote.selectedShipmentMethodUid} · {amount(method?.price, method?.currency)}</p>
        {method?.minDeliveryDate && <p>Quoted delivery: {method.minDeliveryDate} to {method.maxDeliveryDate ?? 'not reported'}</p>}
        <p className="mt-1 text-xs text-gray-500">Product amounts are reported line prices. Shared shipping is shown once for this submission. Taxes, fees or discounts not reported by the quote remain unknown.</p>
      </> : <p>Original monetary quote was not retained for this submission.</p>}
      <p className="mt-2 text-xs text-gray-500">These are Gelato fulfillment costs, separate from the customer checkout price. A quote or receipt alone does not confirm a settled charge.</p>
    </div>
  </div>;
}
