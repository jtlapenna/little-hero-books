import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const manifest=read('accepted-manifest.json');
assert(manifest.files.length>=15);
assert.equal(new Set(manifest.files.map(x=>x.file)).size,manifest.files.length);
for(const x of manifest.files){assert(!path.isAbsolute(x.file)&&!x.file.split('/').includes('..'));assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir,x.file))).digest('hex'),x.sha256,'Checksum mismatch: '+x.file);}
const a=read('converted-unpaid-and-recovery-2026-10-16.json');
assert.equal(a.cases.length,3);assert.deepEqual(a.cases.map(x=>x.case),['website-single','amazon-single','amazon-siblings']);
assert.equal(new Set(a.cases.map(x=>x.providerRootId)).size,3);
assert.equal(new Set(a.cases.flatMap(x=>x.artifacts.map(y=>y.sha256))).size,4);
assert(a.independentClosure.closed&&a.independentClosure.conversions.length===3&&a.independentClosure.conversions.every(x=>x.closed));assert.deepEqual(a.independentClosure.conversions.map(x=>x.id).sort(),a.cases.map(x=>x.authorizationId).sort());
assert(a.independentClosure.native.closed&&a.independentClosure.native.receipts.length===3&&a.independentClosure.native.receipts.every(x=>x.closed&&x.controls.length>0&&x.controls.every(y=>y.verified)));
assert.equal(a.releaseVerification.mergedSource,a.recoveryServingSource);assert.equal(a.releaseVerification.allConclusions,'success');
assert.equal(a.renderedAdminVerification.childPagesInspected,4);assert.equal(a.renderedAdminVerification.printPanelsInspected,4);
assert(a.fundingInspection.noPaymentMethods&&a.fundingInspection.wallets===14&&a.fundingInspection.allWalletsInactiveZero);
assert.equal(a.fundingInspection.invoiceHistoryVerified,false);assert.equal(a.fundingInspection.monthlyInvoiceFundingEnabled,false);
assert.equal(a.normalControlsWritten,false);assert.equal(a.paymentChanges,false);assert.equal(a.paidPrinting,false);assert.equal(a.customerMessages,false);
for(const [index,c] of a.cases.entries()){
 assert.equal(c.artifacts.length,index===2?2:1);assert(c.artifacts.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
 assert.equal(c.conversion.state,'converted');assert(c.conversion.closed&&c.conversion.updatedAtUnchanged);assert.deepEqual(c.conversion.patchBody,{orderType:'order'});assert.equal(c.conversion.newProviderCreates,0);
 assert.deepEqual(c.conversion.providerRequests.map(x=>x.method),['GET','POST','PATCH','GET']);assert(c.conversion.providerRequests.every(x=>x.httpStatus===200));
 const obs=c.conversion.observation;assert.equal(obs.orderType,'order');assert.equal(obs.financialStatus,'pending');assert.equal(obs.fulfillmentStatus,'created');assert.equal(obs.providerOrderId,c.providerRootId);assert.equal(obs.processingStatus,null);assert.equal(obs.processingLogCount,0);assert.equal(obs.unsafeFundingOrProductionObserved,false);
 assert.equal(obs.items.length,c.artifacts.length);assert.deepEqual(obs.items.map(x=>x.providerItemId).sort(),c.artifacts.map(x=>x.provider_item_id).sort());assert(obs.items.every(x=>x.quantity===1&&x.apiPageCount===32&&x.productUid.includes('200x200')&&!x.processedFileUrlPresent));
 assert(c.quote.methods.length>0&&c.quote.selected.shipmentMethodUid===obs.shipmentMethodUid);assert(c.quote.methods.some(x=>x.shipmentMethodUid===c.quote.selected.shipmentMethodUid));assert.equal(c.quote.products.length,c.artifacts.length);assert(c.quote.products.every(x=>x.quantity===1&&x.price>0&&x.currency==='USD'));assert.equal(Math.round(c.quote.productLineTotal*100),Math.round(c.quote.products.reduce((n,x)=>n+x.price,0)*100));assert.equal(Math.round(c.quote.productPlusSelectedShippingExcludingUnreportedTaxOrFees*100),Math.round((c.quote.productLineTotal+c.quote.selected.price)*100));assert.equal(c.quote.taxFeesOrInvoiceProven,false);
 assert(obs.receipts.length>0&&obs.receipts.every(x=>x.isCalculated&&x.total===0&&x.totalInclVat===0));
 const r=c.recovery;assert(r.getOnly&&r.persistenceConfirmed&&r.closureConfirmed&&r.sameRootAndItems&&r.noConversionReplay&&r.ordinaryRowsPreserved);assert(r.providerRequestMethods.length>0&&r.providerRequestMethods.every(x=>x==='GET'));
 const latest=r.providerObservation;assert.equal(latest.providerOrderId,c.providerRootId);assert.equal(latest.orderType,'order');assert.equal(latest.financialStatus,'pending');assert.equal(latest.fulfillmentStatus,'created');assert.equal(latest.unsafeFundingOrProductionObserved,false);assert.equal(latest.processingStatus,null);assert.equal(latest.processingLogCount,0);assert(latest.noNewCreate);assert.equal(latest.items.length,c.artifacts.length);assert.deepEqual(latest.items.map(x=>x.providerItemId).sort(),c.artifacts.map(x=>x.provider_item_id).sort());assert(latest.items.every(x=>x.quantity===1&&x.apiPageCount===32&&x.fulfillmentStatus==='created'&&!x.processedFileUrlPresent));assert(latest.receipts.length>0&&latest.receipts.every(x=>x.isCalculated&&x.total===0&&x.totalInclVat===0));
 assert(r.adminInspection.orders.length===1&&r.adminInspection.orders.every(x=>x.id===c.providerRootId&&x.orderType==='order'&&x.status==='created'&&x.actionReason===null));assert.equal(r.adminInspection.items.length,c.artifacts.length);assert(r.adminInspection.items.every(x=>x.status==='created'&&x.actionReason===null));assert.deepEqual(r.adminInspection.items.map(x=>x.providerItemId).sort(),c.artifacts.map(x=>x.provider_item_id).sort());
 const f=r.controls;assert.equal(f.source,a.recoveryServingSource);assert(f.normalFlagsOff&&f.allWorkflowCopiesInactive);assert.equal(f.normalDispatch,false);assert.equal(f.customerIntents,0);assert.equal(f.openConversionAuthorizations,0);
}
assert.equal(new Set(a.cases.map(x=>x.quote.selected.shipmentMethodUid)).size,3);
const n=read('native-website-repaired-2026-10-16.json');assert.equal(n.cases.length,1);assert.equal(n.cases[0].executionId,'54695');assert.equal(n.w0Repair.initialPublicationHttpStatus,409);assert.equal(n.w0Repair.normalW0PublicationProven,false);assert(n.w0Repair.conditionalCreateOnly&&!n.w0Repair.originalPublicationReplayed);assert(n.finalClosure.closed&&n.finalClosure.controls.length>0&&n.finalClosure.controls.every(x=>x.verified));
const historical=read('native-unpaid-drafts-2026-10-16.json');
for(const c of a.cases){const native=(c.case==='website-single'?n:historical).cases.find(x=>x.case===c.case);assert(native);assert.equal(native.submissionId,c.submissionId);assert.equal(String(native.executionId),String(c.nativeExecutionId));assert.equal(native.artifacts.length,c.artifacts.length);for(const item of c.artifacts){const bound=native.artifacts.find(x=>x.childId===item.child_order_id);assert(bound&&bound.sha256===item.sha256&&bound.providerStoredBytesMatch&&bound.physicalInnerPages===32&&bound.apiPageCount===32&&bound.uploadPages===35);}assert.deepEqual(native.providerOrders.map(x=>x.id),[c.providerRootId]);assert.deepEqual(native.providerOrders.flatMap(x=>x.items.map(y=>y.id)).sort(),c.artifacts.map(x=>x.provider_item_id).sort());}
console.log('Recorded acceptance/recovery: three roots, four PDFs/items, three tiers, GET-only reconciliation, explicit W0/funding limits and final OFF receipts verified. No live provider requests or PDF-byte verification performed.');
