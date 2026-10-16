import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const directory = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(directory, name));
const json = name => JSON.parse(read(name));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = json('manifest.json');
const expected = ['cold-route-auth-check.mts', 'README.md', 'fresh-native.json', 'provenance.json', 'queue-recovery.json', 'shared-status.json', 'timed-status.json', 'verify.mjs'];
assert.deepEqual(Object.keys(manifest.files).sort(), expected.sort());
for (const [name, hash] of Object.entries(manifest.files)) assert.equal(sha(read(name)), hash, `Changed published bytes: ${name}`);
const native = json('fresh-native.json');
assert.equal(native.cases.length, 3);
assert.deepEqual(native.cases.map(c => c.executionId), ['54699', '54700', '54701']);
assert.deepEqual(native.cases.map(c => c.kind), ['website-single', 'amazon-single', 'amazon-siblings']);
const hashes = new Set();
for (const c of native.cases) {
  assert.equal(c.artifacts.length, c.kind === 'amazon-siblings' ? 2 : 1);
  assert.equal(c.providerOrders.length, 1);assert.deepEqual(c.providerRoots,[c.providerOrders[0].id]);assert.equal(c.admin.submissionId,c.submissionId);
  assert.equal(c.providerOrders[0].items.length, c.artifacts.length);
  assert.equal(c.admin.items.length, c.artifacts.length);
  assert.equal(c.admin.customerNotificationCount, 0);
  assert.equal(c.finalOff.normalFlagsOff, true);
  assert.equal(c.finalOff.normalDispatch, false);
  assert.equal(c.finalOff.normalCopiesInactive, true);
  assert.equal(c.finalOff.runtimeDraftsEnabled, false);
  const provider = c.providerOrders[0];
  assert.equal(provider.orderType, 'draft');
  assert.equal(provider.financialStatus, 'draft');
  assert.equal(provider.fulfillmentStatus, 'draft');
  assert.equal(provider.shipmentMethodUid, c.selectedShipmentMethod);
  for (const a of c.artifacts) {
    assert.match(a.sha256, /^[a-f0-9]{64}$/);
    assert(!hashes.has(a.sha256)); hashes.add(a.sha256);
    assert.equal(a.physicalInnerPages, 32); assert.equal(a.apiPageCount, 32); assert.equal(a.uploadPages, 35);
    assert(c.providerOrders[0].items.some(i=>i.itemReferenceId===`lhb-item-${a.childId}`));
    assert.equal(a.providerStoredBytesMatch, true);
    assert.equal(a.processedFileUrlPresent, false);
  }
  for (const item of provider.items) {
    assert.equal(item.quantity, 1); assert.equal(item.pageCount, 32); assert.equal(item.printJobCount, 0);
    assert(c.admin.items.some(m => m.providerItemId === item.id && m.providerOrderId === provider.id));
  }
  const q = c.diagnosticReprice;
  assert.equal(q.workflowQuoteMonetaryBodyRetained, false);
  assert.equal(q.quotes.length, 1);
  assert.equal(q.quotes[0].products.length, c.artifacts.length);
  assert(q.quotes[0].shipmentMethods.some(m => m.shipmentMethodUid === c.selectedShipmentMethod));
  for (const product of q.quotes[0].products) {
    assert.equal(product.quantity, 1); assert.equal(product.pageCount, 32); assert.equal(product.currency, 'USD');
    assert.equal(product.price, 12.18);assert(provider.items.some(i=>i.itemReferenceId===product.itemReferenceId&&i.productUid===product.productUid));
  }
}
assert.equal(hashes.size, 4);
const status = json('shared-status.json');
assert.equal(status.proofs.length, 6);
assert.deepEqual(status.proofs.map(p=>`${p.case}:${p.mode}`).sort(),['website-single','amazon-single','amazon-siblings'].flatMap(c=>['poll','signal'].map(m=>`${c}:${m}`)).sort());
for (const p of status.proofs) {
  assert(['poll', 'signal'].includes(p.mode)); assert.equal(p.authorityClosed, true);
  assert.equal(p.orderType, 'order'); assert.equal(p.financialStatus, 'pending'); assert.equal(p.fulfillmentStatus, 'created');
  assert.equal(p.providerMutations, 0); assert.equal(p.ordinaryDataPreserved, true);
  assert.equal(p.sharedExecutor.customerMessages, false); assert.equal(p.sharedExecutor.normalControlsEnabled, false);
  if(p.mode==='poll'){assert.equal(p.sharedExecutor.checked,1);assert.equal(p.sharedExecutor.refreshed,1);assert.equal(p.sharedExecutor.errors,0);assert.equal(p.sharedExecutor.delivered,0);}else assert.equal(p.sharedExecutor.accepted,true);
  assert.equal(p.sharedExecutor.completed, true); assert.equal(p.sharedExecutor.requiresReview, false);
  assert.equal(p.admin.customerNotificationCount, 0);
  assert.equal(p.controls.allWorkflowCopiesInactive,true);
  assert.equal(p.controls.normalFlagsOff, true); assert.equal(p.controls.normalDispatch, false);
  assert.equal(p.controls.customerIntents, 0); assert.equal(p.controls.openConversionAuthorizations, 0);
}
const timer = json('timed-status.json');
assert.equal(timer.proofs.length, 0, 'A failed scheduled poll must not be credited as success');
assert.equal(timer.failedExecutions.length, 1);
const t=timer.failedExecutions[0];
assert.equal(t.executionId,'54705');assert.equal(t.mode,'trigger');assert.equal(t.status,'error');assert.equal(t.httpCode,'401');
assert.equal(t.lastNodeExecuted,'Poll Existing Unpaid Order');
assert(Date.parse(t.startedAt)>=Date.parse(timer.plannedTickAt));assert(Date.parse(t.startedAt)<=Date.parse(timer.plannedTickAt)+180_000);
assert(timer.closures.some(c=>c.closed&&c.inactive&&c.workflowId===t.workflowId));
assert.equal(timer.finalOff.normalFlagsOff,true);assert.equal(timer.finalOff.normalDispatch,false);assert.equal(timer.finalOff.customerIntents,0);assert.equal(timer.finalOff.openConversionAuthorizations,0);assert.equal(timer.finalOff.pinnedWorkflowCopiesInactive,true);
assert.equal(native.localPdfInspection.receipts.length,4);assert.equal(native.localPdfInspection.selectedRenders.length,16);
for(const r of native.localPdfInspection.receipts){assert.equal(r.decodedPageCount,35);assert.equal(r.allRastersVerified,true);assert(hashes.has(r.sha256));}
const follow=timer.successfulFollowup;
assert.equal(follow.baselineFailedExecutionId,'54705');assert.equal(follow.isolatedReplacementCredential,true);assert.equal(follow.proofs.length,1);
const scheduled=follow.proofs[0];assert.equal(scheduled.executionId,'54706');assert.equal(scheduled.workflowId,t.workflowId);assert.equal(scheduled.provider.providerOrderId,status.proofs.find(p=>p.case==='website-single'&&p.mode==='poll').providerOrderId);assert.equal(scheduled.mode,'trigger');assert.equal(scheduled.providerWrites,0);assert.equal(scheduled.customerMessages,false);
assert.deepEqual(Object.fromEntries(['action','completed','requiresReview','checked','refreshed','errors','delivered','customerMessages','normalControlsEnabled'].map(k=>[k,scheduled.sharedExecutor[k]])),{action:'poll',completed:true,requiresReview:false,checked:1,refreshed:1,errors:0,delivered:0,customerMessages:false,normalControlsEnabled:false});
assert.equal(scheduled.provider.financialStatus,'pending');assert.equal(scheduled.provider.fulfillmentStatus,'created');assert.equal(scheduled.normalControls.normalFlagsOff,true);assert.equal(scheduled.normalControls.normalDispatch,false);
assert(Date.parse(scheduled.actualStartedAt)>=Date.parse(scheduled.plannedTickAt));assert(Date.parse(scheduled.actualStartedAt)<=Date.parse(scheduled.plannedTickAt)+180_000);
assert(follow.closures.some(c=>c.closed&&c.inactive&&c.workflowId===scheduled.workflowId));
const queue=json('queue-recovery.json');assert.equal(queue.approval.maximumSpend,0);assert.equal(queue.approval.paidPrinting,false);assert.equal(queue.approval.customerMessages,false);
assert.equal(queue.fundingInspection.noPaymentMethods,true);assert.equal(queue.fundingInspection.allWalletsInactiveZero,true);assert.equal(queue.fundingInspection.autoTopup,false);assert.equal(queue.fundingInspection.monthlyInvoices,false);assert.equal(queue.fundingInspection.ownerConfirmedNoOtherFunding,true);
assert.equal(queue.queueAttempt.httpStatus,409);assert.equal(queue.queueAttempt.completed,false);assert.equal(queue.queueAttempt.requiresReview,true);assert.deepEqual(queue.queueAttempt.results.map(r=>r.state),['converted','converted','outcome_unknown']);
assert(queue.queueAttempt.results.every(r=>r.persistenceConfirmed&&r.closureConfirmed&&!r.unsafeFundingOrProductionObserved));assert.equal(queue.queueAttempt.customerMessages,false);assert.equal(queue.queueAttempt.normalControlsEnabled,false);
const recovery=queue.observationRecovery;assert.equal(recovery.action,'observe');assert.equal(recovery.providerWrites,0);assert.equal(recovery.conversionReplays,0);assert.equal(recovery.authoritiesCreated,0);assert.equal(recovery.customerMessages,false);assert.equal(recovery.cases.length,3);assert.equal(recovery.controls.allWorkflowCopiesInactive,true);assert.equal(recovery.controls.openConversionAuthorizations,0);assert.equal(recovery.controls.customerIntents,0);assert.equal(recovery.controls.normalFlagsOff,true);assert.equal(recovery.controls.normalDispatch,false);
assert.deepEqual(recovery.cases.map(c=>c.authorizationId),queue.queueAttempt.results.map(r=>r.authorizationId));
for(const c of recovery.cases){const n=native.cases.find(n=>n.kind===c.kind);assert(n);assert.equal(c.workflowExecutionId,n.executionId);assert.equal(c.submissionId,n.submissionId);assert.equal(c.provider.id,n.providerRoots[0]);assert.equal(c.authorityState,'converted');assert.equal(c.authorityClosed,true);assert.equal(c.provider.orderType,'order');assert.equal(c.provider.financialStatus,'pending');assert.equal(c.provider.fulfillmentStatus,'created');assert.equal(c.provider.items.length,n.artifacts.length);assert.equal(c.observations.noNewCreate,true);assert.equal(c.observations.unsafeFundingOrProductionObserved,false);assert.equal(c.admin.customerNotificationCount,0);assert.equal(c.admin.state,'submitted');assert.equal(c.admin.canCancel,false);assert.equal(c.admin.items.length,n.artifacts.length);assert.deepEqual(c.artifacts.map(a=>a.sha256).sort(),n.artifacts.map(a=>a.sha256).sort());assert.deepEqual(c.provider.items.map(i=>i.id).sort(),c.artifacts.map(a=>a.provider_item_id).sort());for(const a of c.artifacts){const item=c.provider.items.find(i=>i.id===a.provider_item_id);assert.equal(item.itemReferenceId,`lhb-item-${a.child_order_id}`);assert.equal(item.quantity,1);assert.equal(item.pageCount,32);assert(c.admin.items.some(i=>i.providerItemId===a.provider_item_id&&i.providerOrderId===c.provider.id&&i.active&&i.status==='created'));}}
const provenance = json('provenance.json');
assert.equal(status.workerSource, provenance.automation.mergedSource);
assert.equal(timer.workerSource, provenance.automation.mergedSource);
assert.equal(native.workerSource, provenance.intake.mergedSource);
assert.equal(provenance.freshQueue.executed, true);
assert.equal(provenance.freshQueue.authorityCreated, true);
assert.equal(provenance.freshQueue.approvalPending, false);
console.log('PASS: published checksums, three native cases/four distinct PDFs, six shared status observations, approved queue/observation-only recovery, initial401 and successful scheduled follow-up, recorded OFF/closure invariants. Offline only; no live verification.');
