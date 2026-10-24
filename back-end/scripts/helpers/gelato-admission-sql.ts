/** Pure rendering of one reviewed transaction. Does not connect, execute SQL or issue approval. */
import assert from 'node:assert/strict';import {IsolatedCasePacket} from './prepare-gelato-isolated-workflows';const SOURCE='c9b939f6a25bda6fa1ee4090973cea2c924c5450'; // Frozen historical admission contract; not the current Git HEAD or a live approval.
const q=(v:string)=>{assert(!v.includes('$lhl$'),'SQL body delimiter is forbidden in input');return "'"+v.replaceAll("'","''")+"'";};
export function prepareAdmissionSql(plan:any,tokenSha256:string,humanMessageReference:string,catalog:any){
 const p=IsolatedCasePacket.parse(plan.packet);const sealed=catalog.cases.find((c:any)=>c.label===plan.label);assert(sealed);assert(sealed.packet.rootOrderId===p.rootOrderId);assert(JSON.stringify(sealed.packet.members)===JSON.stringify(p.members));assert.equal(p.sourceSha,SOURCE);assert(/^[a-f0-9]{64}$/.test(tokenSha256));assert(humanMessageReference.length>=8&&humanMessageReference.length<=512);
 const ids=p.members.map(m=>m.orderDbId).sort((a,b)=>a-b),members=p.members.map(m=>`(id=${m.orderDbId} AND "orderId"=${q(m.orderId)})`).join(' OR '),scope=q(p.scopeId),root=q(p.rootOrderId);
 return `BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('gelato-root:'||${root},0));
SELECT public.assert_gelato_isolation_gates_off();
DO $lhl$
DECLARE ids bigint[]:=ARRAY[${ids.join(',')}];
BEGIN
 PERFORM id FROM public.orders WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.orders WHERE (${members}) AND coalesce(root_order_id,amazon_order_id,"orderId")=${root}
   AND book_specs->'testMode'='true'::jsonb AND print_provider='gelato' AND print_config_version=2
   AND print_inner_page_count=32 AND print_api_page_count=32 AND print_expected_pdf_page_count=35
   AND print_product_uid=${q(sealed.productUid)} AND product_info->>'quantity'='1' AND shipping_tier=${q(sealed.shippingTier)}
   AND shipping_address::jsonb=${q(JSON.stringify(sealed.frozenAddress))}::jsonb AND customer_email=${q(sealed.contactEmail)}
   AND execution_status='done' AND next_workflow IS NULL AND current_workflow IS NULL AND started_at IS NULL
   AND customer_approval_required=true AND customer_approval_status='pending'
   AND print_submission_id IS NULL AND print_claim_token IS NULL AND gelato_order_id IS NULL AND gelato_status IS NULL AND lulu_job_id IS NULL AND lulu_status IS NULL)<>cardinality(ids)
 THEN RAISE EXCEPTION 'Fresh held fixture differs; do not replay or repair'; END IF;
 IF EXISTS(SELECT 1 FROM public.gelato_engineering_submission_windows WHERE root_order_id=${root}) OR EXISTS(SELECT 1 FROM public.gelato_isolation_scopes WHERE id=${scope}::uuid OR root_order_id=${root})
 THEN RAISE EXCEPTION 'Authority already exists; exact read-only reconciliation only'; END IF;
 INSERT INTO public.gelato_engineering_submission_windows(root_order_id,child_order_ids,opened_at,expires_at,account_key_sha256,fixture_manifest_sha256,evidence_run_id)
 VALUES(${root},ids,${q(p.startsAt)}::timestamptz,${q(p.expiresAt)}::timestamptz,${q(p.accountKeySha256)},${q(p.fixtureManifestSha256)},${q(p.runId)});
 INSERT INTO public.gelato_isolation_scopes(id,root_order_id,token_sha256,account_key_sha256,fixture_manifest_sha256,expires_at)
 VALUES(${scope}::uuid,${root},${q(tokenSha256)},${q(p.accountKeySha256)},${q(p.fixtureManifestSha256)},${q(p.expiresAt)}::timestamptz);
 UPDATE public.orders SET customer_approval_status='approved',customer_approval_approved_at=clock_timestamp(),human_approved=true,human_reviewed_at=clock_timestamp(),human_reviewer=${q('engineering human approval: '+humanMessageReference)},execution_status='ready_for_processing',next_workflow=${q(ids.length===2?'4-aggregate':'4')}
 WHERE id=ANY(ids);
END $lhl$;
COMMIT;
`;
}
