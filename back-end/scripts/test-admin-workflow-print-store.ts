/** Native migrated PostgreSQL. No hosted services or provider transport. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalPreviewDatabase } from '../../scripts/testing/local-preview-database';
import { canonicalJsonSha256 } from '../src/lib/canonical-json-sha256';
const root = resolve('..'), db = new LocalPreviewDatabase();
const q = (v: unknown) => "'" + String(v).replaceAll("'", "''") + "'";
const j = (v: unknown) => q(JSON.stringify(v)) + '::jsonb';
const value = (sql: string) => JSON.parse(db.sql(sql));
const checks: string[] = [];
function check(name: string, run: () => void) { run(); checks.push(name); }
try {
 db.start(root, true);
 db.sql('ALTER TABLE orders ADD COLUMN IF NOT EXISTS queued_at timestamptz, ADD COLUMN IF NOT EXISTS customer_email text, ADD COLUMN IF NOT EXISTS customer_name text, ADD COLUMN IF NOT EXISTS shipping_tier text, ADD COLUMN IF NOT EXISTS quantity integer;');
 const migration = readFileSync(resolve(root, 'database/20261115230112_admin_workflow_test_print_hold.sql'), 'utf8');
 const before = db.sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM orders o');
 db.sql(migration); db.sql(migration);
 check('idempotent upgrade preserves existing rows and global gate OFF', () => {
  assert.equal(db.sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM orders o'), before);
  assert.equal(db.sql("SELECT enabled FROM print_provider_dispatch_gates WHERE provider='gelato'"), 'f');
 });
 const admission = { schema: 'lhb.admin-workflow-test@v1', createdBy: 'operator@example.test', createdAt: new Date().toISOString(), bookId: 'book-finding-our-inner-voice', formatId: 'amazon', configVersion: 4 };
 const info = { _overnight_test: true, _created_via_csv: true, _admin_workflow_test: admission };
 db.sql(`INSERT INTO orders(id,"orderId",root_order_id,amazon_order_id,product_info,execution_status,print_provider,print_book_id,print_format_id,print_config_version,manifest_3_url,customer_approval_status,review_stages,quantity)
 VALUES(1001,'TEST-LOCAL-NEW','TEST-LOCAL-NEW','TEST-LOCAL-NEW',${j(info)},'ready_for_processing','gelato','book-finding-our-inner-voice','amazon',4,'manifest3','approved','{"postPdf":{"status":"approved"}}',1)`);
 db.sql("UPDATE orders SET next_workflow='4' WHERE id=1001");
 check('wrong actor cannot queue preparation', () => assert.throws(() => db.sql("SELECT request_admin_workflow_test_print_preparation(1001,'foreign@example.test')")));
 db.sql("SELECT request_admin_workflow_test_print_preparation(1001,'operator@example.test')");
 const route = { orderDbId: 1001, orderId: 'TEST-LOCAL-NEW', rootOrderId: 'TEST-LOCAL-NEW', provider: 'gelato', bookId: admission.bookId, formatId: 'amazon', configVersion: 4, innerPageCount: 32, apiPageCount: 32, expectedPdfPageCount: 35, productUid: 'synthetic-product' };
 db.sql(`UPDATE orders SET shipping_address=${j({name:'Test Adult',country:'US',address_line_1:'1 Test Lane',city:'Test City',state:'CA',zip:'00000',email:'test@example.test'})} WHERE id=1001`);
 const claim = value(`SELECT claim_gelato_print_submission(${j([route])},'local-job')`);
 check('explicit test preparation can claim with global dispatch OFF', () => assert.equal(claim.dispatch, true));
 const sid = q(claim.submissionId), token = q(claim.claimToken), fp = 'a'.repeat(64), snapshot = { request: { orderType: 'draft', orderReferenceId: claim.orderReferenceId, customerReferenceId: route.rootOrderId, currency: 'USD', shipmentMethodUid: 'standard', shippingAddress: {firstName:'Test',lastName:'Adult',country:'US',addressLine1:'1 Test Lane',city:'Test City',state:'CA',postCode:'00000',email:'test@example.test'}, items:[{itemReferenceId:'lhb-item-1001',productUid:route.productUid,pageCount:32,quantity:1,files:[{type:'default',url:'https://admin.littleherolabs.com/api/pdf/book-finding-our-inner-voice/orders/TEST-LOCAL-NEW/gelato/print/v4/'+ 'b'.repeat(24)+'.pdf?printerGrant=abc.def.ghi'}]}]}, config:{provider:'gelato',productUid:route.productUid,apiPageCount:32,expectedPdfPageCount:35,shipmentMethodPolicy:{version:1}},shippingTier:'standard',printerFiles:{version:1,issuedAt:Math.floor(Date.now()/1000),expiresAt:Math.floor(Date.now()/1000)+7200} };
 db.sql(`SELECT register_gelato_print_artifact(${sid},${token},1001,'book-finding-our-inner-voice/orders/TEST-LOCAL-NEW/gelato/print/v4/${'b'.repeat(24)}.pdf','${'b'.repeat(24)}',35)`);
 db.sql(`SELECT record_gelato_quote_snapshot(${sid},${token},'quote','standard',1,clock_timestamp(),ARRAY['lhb-item-1001'],'${fp}',${j(snapshot)})`);
 check('claim and quote cannot authorize provider create, even global ON', () => {
  db.sql("UPDATE print_provider_dispatch_gates SET enabled=true WHERE provider='gelato'");
  assert.throws(() => db.sql(`SELECT begin_gelato_print_submission(${sid},${token},'automation','${fp}')`));
  db.sql("UPDATE print_provider_dispatch_gates SET enabled=false WHERE provider='gelato'");
 });
 const packet = { submissionId: claim.submissionId, claimToken: claim.claimToken, executionId: 'human-exact-execution', quoteSnapshot: snapshot, accountSha256: 'c'.repeat(64), artifacts: [] }, digest = canonicalJsonSha256(packet);
 db.sql(`SELECT hold_admin_workflow_test_print(${sid},${token},${j(packet)},'${digest}')`);
 check('held preparation leaves no running order or next stage', () => {
  const row = value('SELECT to_jsonb(o) FROM orders o WHERE id=1001');
  assert.equal(row.execution_status, 'done'); for (const field of ['current_workflow', 'next_workflow', 'started_at']) assert.equal(row[field], null);
  assert.equal(db.sql(`SELECT request_state FROM print_provider_submissions WHERE id=${sid}`), 'operator_review');
 });
 check('held preparation cannot be requeued, edited, reclaimed or reconciled', () => {
  assert.throws(() => db.sql("UPDATE orders SET next_workflow='4' WHERE id=1001"));
  assert.throws(() => db.sql("UPDATE orders SET shipping_address='{}' WHERE id=1001"));
  assert.equal(value(`SELECT begin_gelato_reconciliation(${sid},'automatic-recovery')`).recover, false);
  assert.equal(value(`SELECT claim_gelato_print_submission(${j([route])},'local-job')`).dispatch, false);
 });
 check('failed quote refresh returns to a durable hold and remains refreshable', () => {
  db.sql(`SELECT refresh_admin_workflow_test_print(${sid},'operator@example.test')`);
  db.sql(`SELECT return_admin_workflow_test_print_hold(${sid},${token})`);
  assert.equal(db.sql(`SELECT request_state FROM print_provider_submissions WHERE id=${sid}`),'operator_review');
  assert.equal(db.sql('SELECT execution_status FROM orders WHERE id=1001'),'done');
  assert.throws(()=>db.sql(`SELECT approve_admin_workflow_test_print(${sid},'operator@example.test','${digest}','${'c'.repeat(64)}')`));
  db.sql(`SELECT refresh_admin_workflow_test_print(${sid},'operator@example.test')`);
  db.sql(`SELECT hold_admin_workflow_test_print(${sid},${token},${j(packet)},'${digest}')`);
 });
 check('approval needs exact actor, packet and account', () => {
  for (const [actor, sha, account] of [['foreign@example.test', digest, 'c'.repeat(64)], ['operator@example.test', 'f'.repeat(64), 'c'.repeat(64)], ['operator@example.test', digest, 'd'.repeat(64)]])
   assert.throws(() => db.sql(`SELECT approve_admin_workflow_test_print(${sid},${q(actor)},'${sha}','${account}')`));
 });
 db.sql(`SELECT approve_admin_workflow_test_print(${sid},'operator@example.test','${digest}','${'c'.repeat(64)}')`);
 check('approved execution cannot be substituted', () => assert.throws(() => db.sql(`SELECT begin_gelato_print_submission(${sid},${token},'different','${fp}')`)));
 db.sql(`SELECT begin_gelato_print_submission(${sid},${token},'human-exact-execution','${fp}')`);
 db.sql(`SELECT authorize_gelato_print_send(${sid},${token},'human-exact-execution','${fp}')`);
 check('authorization is consumed durably before send and cannot replay', () => {
  assert.equal(db.sql(`SELECT operator_approval_consumed_at IS NOT NULL AND send_started_at IS NOT NULL FROM print_provider_submissions WHERE id=${sid}`), 't');
  assert.throws(() => db.sql(`SELECT authorize_gelato_print_send(${sid},${token},'human-exact-execution','${fp}')`));
  assert.throws(() => db.sql(`SELECT approve_admin_workflow_test_print(${sid},'operator@example.test','${digest}','${'c'.repeat(64)}')`));
 });
 console.log(JSON.stringify({ passed: true, checks, providerCalls: 0, globalGateEnabled: false }));
} finally { db.close(); }
