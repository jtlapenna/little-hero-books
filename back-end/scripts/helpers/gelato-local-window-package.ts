/** Local readiness package. Never creates IDs, secrets, scopes, claims or executable approval. */
import {z} from 'zod';
import retainedInspection from '../../../docs/repo-workflows-planning/gelato-live-prep-evidence-2026-10-19/pdf-inspection.json';
import {GelatoPrintConfigSchema} from '../../src/lib/books/types';
import {definitionSha256} from './prepare-w1-native-queue';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const frozen=z.object({results:z.array(z.object({role:z.string(),sha256:hash,pageCount:z.literal(35),blankPdfPages:z.tuple([z.literal(2),z.literal(35)]),all33SourceImagesPixelIdentical:z.literal(true),allPageBoxesCorrect:z.literal(true)}).passthrough()).length(4)}).passthrough();
const roles=['WEB-A','AMZ-A','SIB-A','SIB-B'];
export const WINDOW_BLOCKERS=[
 'Current main/serving/migration source identity and reviewed native graph versions',
 'Fresh owner/dashboard confirmation of correct account, no payment/credit/funding route and message suppression',
 'Separately approved GELATO_STATUS_API_KEY configuration with exact saved/serving account digest',
 'Separately approved diagnostic workflow installation, managed credential binding and authenticated no-op proof',
 'Fresh controlled intake/approval rows, immutable artifact keys/bytes, recipient confirmation and exact published versions',
 'Concrete scope/member identities, expiry, independent cleanup/reconciliation commands and approved context raw-file hash',
 'Explicit approval of this exact $0 draft-only live packet; never reuse historical approvals or journals',
 'Separate review/approval of any additional quote-only tier-comparison transport and its exact request budget',
] as const;
export function prepareLocalWindowPackage(raw:unknown,standardRaw:unknown,amazonRaw:unknown){
 const standard=GelatoPrintConfigSchema.parse(standardRaw),amazon=GelatoPrintConfigSchema.parse(amazonRaw);
 if([standard,amazon].some(c=>c.innerPageCount!==32||c.apiPageCount!==32||c.expectedPdfPageCount!==35||c.apiPageCountVerified!==true)||standard.productUid!==amazon.productUid||definitionSha256(standard.shipmentMethodPolicy)!==definitionSha256(amazon.shipmentMethodPolicy))throw Error('Review changed product/page/shipping contracts first');
 const tiers=Object.keys(standard.shipmentMethodPolicy.tiers);
 const inspection=frozen.parse(raw);
 if(new Set(inspection.results.map(r=>r.role)).size!==4||roles.some(role=>!inspection.results.some(r=>r.role===role))||new Set(inspection.results.map(r=>r.sha256)).size!==4)throw Error('Four exact distinguishable frozen roles required');
 if(new Set(tiers).size!==3||!['standard','priority','expedited'].every(t=>tiers.includes(t)))throw Error('Review changed offered tiers before preparing a window');
 if(inspection.results.some(row=>retainedInspection.results.find(r=>r.role===row.role)?.sha256!==row.sha256))throw Error('Frozen role/byte association differs from retained independent inspection');
 const artifacts=roles.map(role=>{const row=inspection.results.find(r=>r.role===role)!;return {role,sha256:row.sha256,physicalInnerPages:32,apiPageCount:32,uploadedPdfPages:35};});
 const cases=[{case:'website-single',workflow:'W4',roles:['WEB-A']},{case:'amazon-single',workflow:'W4',roles:['AMZ-A']},{case:'amazon-siblings',workflow:'W4.1',roles:['SIB-A','SIB-B']}];
 return {schema:'lhl.local-window-readiness@1',executable:false,canInstall:false,canIssueScope:false,canApprove:false,
  artifactEvidence:'Retained October19 independent PDF inspection; hashes are historical, recheck private actual bytes before live use',artifacts,
  product:{uid:standard.productUid,standardConfigSha256:definitionSha256(standard),amazonConfigSha256:definitionSha256(amazon),shipmentPolicyVersion:standard.shipmentMethodPolicy.version},artifactManifestSha256:definitionSha256(artifacts),cases:cases.map(c=>({...c,quantities:c.roles.map(()=>1),tiers})),
  proposal:{maximumSpendCents:0,draftCreates:3,books:4,primaryWorkflowQuotes:3,additionalTierQuotes:6,totalQuotes:9,regularConversions:0,providerOrderSearches:0},
  budgets:'Core adapter budgets remain separate. Account for provider originals and every polling reread; do not assume a 4-file cap covers status refreshes. Final concrete packet must enumerate all calls and bytes.',
  excluded:'Six pending orders: no IDs selected, read, refreshed, mutated or released. No funding or customer messages.',
  missing:WINDOW_BLOCKERS,remainingProof:['Fresh W4/W4.1 files/drafts/mappings/admin/polling/recovery','Genuine W0/W3 generation/preview/approval/ordinary scheduling coverage','All shipping choices, quote/order estimates, provider processing and exact no-payment boundary','Trusted final payable and maximum-spend mechanism','Separately approved physical production, actual charges, shipment/delivery/inspection; cancellation separately approved'],
  stopRules:['Any digest/account/file/mapping disagreement','Unknown acknowledgement or incomplete independent closure','Unexpected provider graph, notification intent or funding change','Expiry or call/byte limit','Missing provider evidence is Not tested, not Passed'],
 };
}
