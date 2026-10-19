/** Isolated execution-core checks. No dotenv, hosted store, global network or deployment. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { OrdinaryReleaseDependencies, OrdinaryReleasePermit, OrdinaryReleaseOutcome } from '../src/lib/books/gelato-ordinary-release-core';
async function main(){
 Object.assign(process.env,{SUPABASE_URL:'https://release-db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-release-service',BACKEND_API_TOKEN:'synthetic-release-signing-at-least-thirty-two-bytes',
  GELATO_DRAFT_SUBMISSION_ENABLED:'false',GELATO_CANCEL_ENABLED:'false',GELATO_STATUS_RELAY_ENABLED:'false',GELATO_STATUS_POLLING_ENABLED:'false',GELATO_SCHEDULED_STATUS_ENABLED:'false',GELATO_NOTIFICATIONS_ENABLED:'false'});
 const previous=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No global transport in local ordinary-release tests');};
 const watchdog=setTimeout(()=>{throw Error('Local release checks did not finish');},60000);
 try{
 const {prepareOrdinaryRelease,executeOrdinaryRelease,observeOrdinaryRelease,ordinaryReleaseDigest}=await import('../src/lib/books/gelato-ordinary-release-core');
 const {GelatoSavedSnapshotSchema}=await import('../src/lib/books/gelato-submission');
 const {gelatoQuoteRequestFingerprint}=await import('../src/lib/books/gelato-api-contract');
 const cases:Array<{name:string;passed:boolean}>=[];
 const {createOrdinaryReleaseFixture:setup}=await import('./helpers/gelato-ordinary-release-fixture');
 const check=async(name:string,work:()=>Promise<void>)=>{await work();cases.push({name,passed:true});};
 for(const [format,children,name]of[['standard',1,'website'],['amazon',1,'amazon-single'],['amazon',2,'amazon-siblings']]as const){
  await check(name+' one owned send and replay',async()=>{const s=await setup(format,children);const result=await executeOrdinaryRelease(s.permit.id,s.d);assert.equal(result.state,'converted');assert.equal(result.persistenceConfirmed,true);
   assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'already_attempted');assert.equal(s.stats().patches,1);s.assertClean();});
 }
 await check('canonical nested quantity two is released with aggregate costs',async()=>{const s=await setup('standard',1,undefined,0,2,true);const r=await executeOrdinaryRelease(s.permit.id,s.d);assert.equal(r.state,'converted');assert.equal(s.stats().patches,1);s.assertClean();});
 await check('OFF before all store/provider access',async()=>{const s=await setup();s.setEnabled(false);assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'disabled');assert.equal(s.stats().claims,0);assert.equal(s.stats().attempts.length,0);});
 await check('missing enablement defaults OFF',async()=>{const s=await setup();delete s.d.enabled;assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'disabled');assert.equal(s.stats().claims,0);});
 for(const kind of ['missing-total','wrong-account-evidence','wrong-quote','bad-arithmetic','over-cap','tax-change','currency','stale-evidence','quote-evidence-digest']){
  await check(kind+' blocks before mutation',async()=>{const s=await setup();const m={...s.fullPayable};
   if(kind==='missing-total')s.setPayable(null);
   else{if(kind==='wrong-account-evidence')m.accountSha256='a'.repeat(64);if(kind==='wrong-quote')m.quoteId='other';if(kind==='bad-arithmetic')m.totalCents='1819';
    if(kind==='over-cap'){m.feesCents='1000';m.totalCents='2818';}if(kind==='tax-change'){m.taxesCents='101';m.totalCents='1819';}
    if(kind==='quote-evidence-digest')m.quoteResponseSha256='f'.repeat(64);if(kind==='currency')m.currency='EUR';if(kind==='stale-evidence')m.quotedAt='2026-10-16T11:00:00Z';s.setPayable(m);}
   assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'preflight_failed');assert.equal(s.stats().patches,0);s.assertClean();});
 }
 for(const kind of ['approval','recipient','quantity','artifact','member','expired','packet','account','claim','tier','edition','book','version','frozen-product','root','busy','stage','nested-quantity']){
  await check(kind+' changes block before mutation',async()=>{const s=await setup();const row=s.f.rows.values().next().value!;
   if(kind==='nested-quantity'){row.quantity=null;row.product_info={quantity:2};}
   if(kind==='claim')row.print_claim_token=randomUUID();if(kind==='tier')row.shipping_tier='express';if(kind==='edition')row.print_format_id='other';if(kind==='book')row.print_book_id='other';if(kind==='version')row.print_config_version=3;if(kind==='frozen-product')row.print_product_uid='other';if(kind==='root')row.root_order_id='other';if(kind==='busy')row.current_workflow='3';if(kind==='stage')row.review_stages={postPdf:{status:'pending'}};
   if(kind==='approval')row.customer_approval_status='revision_requested';if(kind==='recipient')row.shipping_address={};if(kind==='quantity')row.quantity=2;
   if(kind==='artifact')s.f.blobs.set(s.permit.artifacts[0].key,Buffer.from('changed'));
   if(kind==='member')s.f.context.members[0].provider_item_id='other-item';if(kind==='expired')s.setTime(new Date('2026-10-16T12:16:00Z'));
   if(kind==='packet')s.permit.packetSha256='f'.repeat(64);if(kind==='account')s.d.apiKey='another-account';
   const result=await executeOrdinaryRelease(s.permit.id,s.d);assert.notEqual(result.state,'converted');assert.equal(s.stats().patches,0);
   if(kind!=='account')s.assertClean();});
 }
 await check('missing exact provider service blocks release and reconciliation',async()=>{const s=await setup();s.setFault('shipment-missing');assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'preflight_failed');assert.equal(s.stats().patches,0);await assert.rejects(()=>observeOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000)));s.assertClean();});
 await check('changed approved snapshot cannot redefine recovery destination',async()=>{const s=await setup();s.convertExternally();s.setFault('changed-snapshot');
  const changed=GelatoSavedSnapshotSchema.parse(s.f.context.submission.request_snapshot);changed.request.shippingAddress.city='Other City';s.f.context.submission.request_snapshot=changed;
  await assert.rejects(()=>observeOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000)),/approved_snapshot_mismatch/);assert.equal(s.stats().patches,0);s.assertClean();});
 await check('approval time window cannot change under an old packet',async()=>{const s=await setup();s.setTime(new Date('2026-10-16T12:02:00Z'));s.permit.approvedAt='2026-10-16T12:01:00Z';s.permit.expiresAt='2026-10-16T12:16:00Z';assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'preflight_failed');assert.equal(s.stats().patches,0);s.assertClean();});
 await check('approval packet is specific to permit identity',async()=>{const s=await setup();const prepared=await prepareOrdinaryRelease({...s.permit,id:randomUUID()},s.d,AbortSignal.timeout(2000));assert.notEqual(prepared.packetSha256,s.permit.packetSha256);assert.equal(s.stats().patches,0);s.assertClean();});
 await check('provider root identity change blocks conversion and observation',async()=>{const s=await setup();s.setFault('provider-id');assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'preflight_failed');assert.equal(s.stats().patches,0);await assert.rejects(()=>observeOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000)),/provider_identity_changed/);s.assertClean();});
 for(const fault of ['approval-revoked','file-after-authorization','off-after-authorization','authorize-false','authorize-unknown','root-after-authorization','reference-after-authorization']){
  await check(fault+' consumed and held',async()=>{const s=await setup();s.setFault(fault);assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'outcome_unknown');assert.equal(s.stats().patches,0);
   s.setEnabled(true);assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'already_attempted');s.assertClean();});
 }
 for(const fault of ['lost','redirect','rejected','readback','timeout','provider-file-after-send']){
  await check(fault+' never repeats mutation',async()=>{const s=await setup();s.setFault(fault);if(fault==='timeout')s.d.budgetMs=1000;
   const result=await executeOrdinaryRelease(s.permit.id,s.d);assert.equal(result.state,['lost','redirect'].includes(fault)?'converted':'outcome_unknown');
   assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'already_attempted');assert.equal(s.stats().patches,1);s.assertClean();});
 }
 await check('hung initial control read is bounded before store access',async()=>{const s=await setup();s.d.budgetMs=30;s.d.enabled=async()=>new Promise<boolean>(()=>{});const result=await executeOrdinaryRelease(s.permit.id,s.d);assert.equal(result.state,'preflight_failed');assert.equal(s.stats().claims,0);s.assertClean();});
 await check('standalone preparation and observation ports are deadline bounded',async()=>{const s=await setup();s.d.context=async()=>new Promise(()=>{});await assert.rejects(()=>prepareOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(30)),/deadline/);await assert.rejects(()=>observeOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(30)),/deadline/);assert.equal(s.stats().patches,0);s.assertClean();});
 await check('lost persistence does not allow resend',async()=>{const s=await setup();s.setPersist(false);const result=await executeOrdinaryRelease(s.permit.id,s.d);assert.equal(result.persistenceConfirmed,false);
  assert.equal(s.stats().state,'sending');assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'already_attempted');assert.equal(s.stats().patches,1);s.assertClean();});
 await check('parallel execution has one owner',async()=>{const s=await setup();const results=await Promise.all([executeOrdinaryRelease(s.permit.id,s.d),executeOrdinaryRelease(s.permit.id,s.d)]);
  assert.equal(results.filter(r=>r.state==='converted').length,1);assert.equal(results.filter(r=>r.state==='busy').length,1);assert.equal(s.stats().patches,1);s.assertClean();});
 await check('sibling stored-byte swap stops release',async()=>{const s=await setup('amazon',2);s.setFault('swapped');assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'preflight_failed');assert.equal(s.stats().patches,0);s.assertClean();});
 await check('sibling original URL echo still requires exact member scope',async()=>{const s=await setup('amazon',2);
  const saved=GelatoSavedSnapshotSchema.parse(s.f.context.submission.request_snapshot);
  [saved.request.items[0].files,saved.request.items[1].files]=[saved.request.items[1].files,saved.request.items[0].files];
  // Even an internally re-bound candidate packet must not authorize swapped URLs.
  const request={orderReferenceId:saved.request.orderReferenceId,customerReferenceId:saved.request.customerReferenceId,currency:saved.request.currency,recipient:saved.request.shippingAddress,allowMultipleQuotes:false as const,products:saved.request.items};
  const fingerprint=gelatoQuoteRequestFingerprint(request,saved.config.shipmentMethodPolicy,saved.shippingTier,saved.request.shipmentMethodUid);
  saved.monetaryQuote!.requestFingerprint=fingerprint;s.f.context.submission.request_snapshot=saved;s.f.context.submission.quote_request_fingerprint=fingerprint;
  s.permit.requestSnapshotSha256=ordinaryReleaseDigest(saved);
  await assert.rejects(()=>prepareOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000)),/artifact_scope_mismatch/);
  await assert.rejects(()=>observeOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000)),/artifact_scope_mismatch/);assert.equal(s.stats().patches,0);s.assertClean();});
 await check('recovery requires a bijective sibling membership even on original URL echo',async()=>{const s=await setup('amazon',2);s.convertExternally();s.setFault('original-echo');s.f.context.members[1]=structuredClone(s.f.context.members[0]);await assert.rejects(()=>observeOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000)),/membership_not_bijective/);assert.equal(s.stats().patches,0);s.assertClean();});
 await check('separate permit IDs share a consumed provider-root fence',async()=>{const s=await setup(), acquire=s.d.store.acquire;let rootClaimed=false;
  s.d.store.acquire=async(...args)=>{if(rootClaimed)return{kind:'already_attempted'};rootClaimed=true;return acquire(...args);};
  const results=await Promise.all([executeOrdinaryRelease(s.permit.id,s.d),executeOrdinaryRelease(randomUUID(),s.d)]);
  assert.equal(results.filter(result=>result.state==='converted').length,1);assert.equal(results.filter(result=>result.state==='already_attempted').length,1);assert.equal(s.stats().patches,1);s.assertClean();});
 await check('read-only reconciliation after expiry never resends',async()=>{const s=await setup();s.setFault('readback');await executeOrdinaryRelease(s.permit.id,s.d);assert.equal(s.stats().patches,1);
  s.setFault('');s.setTime(new Date('2026-10-17T12:00:00Z'));const result=await observeOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000));assert.equal(result.converted,true);assert.equal(s.stats().patches,1);s.assertClean();});
 await check('externally converted draft cannot be sent again',async()=>{const s=await setup();s.convertExternally();assert.equal((await executeOrdinaryRelease(s.permit.id,s.d)).state,'preflight_failed');assert.equal(s.stats().patches,0);s.assertClean();});
 const output={passed:true,checks:cases.length,cases,liveRequests:0,hostedControlsAccessed:false,providerMutations:'simulated only',
  store:'in-memory CAS in this suite; persistence evidence is supplied by the separate disposable SQL suite',payableEvidence:'synthetic complete totals only; current real partial quotes remain blocked',
  pdfs:'35-page labelled geometry fixtures; prior connected assembly proof remains separate',productionEntryPoint:false};
 if(process.env.GELATO_ORDINARY_RELEASE_OUTPUT)await writeFile(process.env.GELATO_ORDINARY_RELEASE_OUTPUT,JSON.stringify(output,null,2)+'\n');
 assert.equal(process.env.GELATO_DRAFT_SUBMISSION_ENABLED,'false');console.log(JSON.stringify(output));
 }finally{clearTimeout(watchdog);globalThis.fetch=previous;}
}
void main().catch(error=>{console.error(error);process.exitCode=1});
