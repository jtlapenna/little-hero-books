import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'native-manifest.json'),'utf8'));
for(const file of manifest.files){assert(/^[A-Za-z0-9_./-]+$/.test(file.file)&&!file.file.split('/').includes('..'));assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file.file))).digest('hex'),file.sha256,'Checksum differs: '+file.file);}
const evidence=JSON.parse(fs.readFileSync(path.join(root,'native-unpaid-drafts-2026-10-16.json'),'utf8'));
assert.equal(evidence.cases.length,3);assert.equal(evidence.normalOrderingClosed,true);assert.equal(evidence.paidPrinting,false);assert.equal(evidence.paymentChanges,false);assert.equal(evidence.customerMessages,false);
const tiers={'website-single':'standard','amazon-single':'priority','amazon-siblings':'expedited'};
assert.deepEqual(evidence.cases.map(c=>c.case).sort(),Object.keys(tiers).sort());
const hashes=[];
for(const c of evidence.cases){assert.equal(c.status,'Passed with real provider evidence.');assert.equal(c.shippingTier,tiers[c.case]);assert.equal(c.quote.selected.shipmentMethodUid,c.shipmentMethodUid);assert(c.quote.productLineTotal>0);assert.notEqual(c.quote.nativeSelectionQuoteId,c.quote.diagnosticRepriceQuoteId);assert.equal(c.artifacts.length,c.case==='amazon-siblings'?2:1);assert.equal(c.adminMappingsVerified,true);assert.equal(c.scopedRefreshVerified,true);assert.equal(c.customerNotificationIntents,0);assert.equal(c.ordinaryRowsPreserved,true);
 assert(c.workflowVersionId);assert.match(c.workflowGraphSha256,/^[a-f0-9]{64}$/);assert.match(c.rawExecutionGraphSha256,/^[a-f0-9]{64}$/);assert(c.normalControls.normalFlagsOff&&c.normalControls.normalCopiesInactive&&!c.normalControls.normalDispatch&&!c.normalControls.runtimeDraftsEnabled);
 for(const a of c.artifacts){assert.equal(a.physicalInnerPages,32);assert.equal(a.apiPageCount,32);assert.equal(a.uploadPages,35);assert.equal(a.providerStoredBytesMatch,true);assert.match(a.sha256,/^[a-f0-9]{64}$/);hashes.push(a.sha256);}
 assert.equal(c.providerOrders.length,1); assert.equal(c.providerOrders[0].items.length,c.artifacts.length); assert.deepEqual(c.providerOrders[0].items.map(i=>i.itemReferenceId).sort(),c.artifacts.map(a=>`lhb-item-${a.childId}`).sort());
 for(const o of c.providerOrders){assert.equal(o.orderType,'draft');assert.equal(o.financialStatus,'draft');assert.equal(o.processingStatus,null);assert.equal(o.processingLogCount,0);assert(o.items.every(i=>i.quantity===1&&i.apiPageCount===32&&!i.processedFileUrlPresent));}
}
assert.equal(new Set(hashes).size,4);assert.equal(evidence.finalClosure.closed,true);assert(evidence.finalClosure.controls.every(c=>c.verified));assert.equal(evidence.finalClosure.normalControlsWritten,false);
const controlNames=evidence.finalClosure.controls.map(c=>c.control);assert.equal(new Set(controlNames).size,15);assert.equal(controlNames.length,15);for(const name of ['dedicated-workflow-copies','normal-runtime-OFF','normal-dispatch-OFF','normal-copy-OFF:8ZqgZ7ksY0Fj8Acx','normal-copy-OFF:d7wi1rS0CxGVdRVb','normal-project-serving-flags-OFF'])assert(controlNames.includes(name));for(const prefix of ['window:','unclaimed-hold:','dedicated-copy:'])assert.equal(controlNames.filter(n=>n.startsWith(prefix)).length,{'window:':3,'unclaimed-hold:':4,'dedicated-copy:':2}[prefix]);
console.log('Recorded native evidence consistent: three cases, four distinct PDFs, selected tiers and OFF receipts. No live provider or PDF-byte verification performed.');
