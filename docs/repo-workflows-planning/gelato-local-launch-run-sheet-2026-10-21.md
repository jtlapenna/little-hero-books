# Local tooling and proposed isolated window — October 21

Preparation only. Controls remain OFF. Six existing pending orders are excluded from every read and action. No current account, funding or deployment state is claimed by offline preparation. No hosted configuration, workflow installation, scope issuance, new order, conversion, funding, production or customer message is authorized. This supplements, rather than replaces, the October20 isolated run sheet.

## What can run locally now

From `back-end`, using the tested Node24.5.0 (or supported Node22.19+) and existing locked dependencies:

```sh
node --import tsx scripts/test-gelato-protected-launch.ts
node --import tsx scripts/test-gelato-local-window.ts
node --import tsx scripts/prepare-gelato-local-window.ts --out /ABSOLUTE/NEW/PRIVATE_DIRECTORY
```

The first command creates synthetic-only private contexts and a loopback server; actual worker/monitor processes use the same launcher that a later approved window would use. It does not read project env or private production files. The second replays retained redacted October19 quote responses, then mutates explicit synthetic cases. The third writes a non-executable `readiness.json` with exact historical PDF roles/hashes, product/config identities, three cases, budgets and missing prerequisites. It refuses an existing output directory. It does not create fresh database identities or approval.

The retained PDFs are WEB-A, AMZ-A, SIB-A and SIB-B: four distinguishable books, one each. See the evidence readiness artifact for full SHA256s. Each has 32 physical inner pages, API pageCount32 and 35 uploaded pages. These separate counts and role/hash associations are checked against the retained independent inspection. Actual immutable private bytes and current assembly output must be rechecked before live use; a checksum manifest is not a renewed visual inspection or final-artwork approval.

## Dormant launch command and private contract

`launch-gelato-protected-case.ts` accepts exactly a mode, `--context PRIVATE_FILE` and `--approved-context-sha256 REVIEWED_RAW_FILE_HASH`. There is no default live mode or env/key discovery. The authoritative strict schema is `helpers/gelato-protected-launch-context.ts`.

A context file must be canonical, owned, non-linked, at most100KB and mode0600 in a canonical owned0700 directory. The journal root must already exist, be canonical/owned0700, and remain persistent. Bind the entire reviewed raw file digest, including its journal root, exact protected binding, approval, explicit transport and private credentials. Do not put a context, its credentials, recipient or approval contents in Git/chat/output. File or graph changes require renewed exact review and approval. Never move to a fresh journal root or delete/reset ownership history to bypass a consumed attempt.

`--rehearse` only accepts synthetic authorities and `https://diagnostic.example.test` with an explicit `http://127.0.0.1:PORT` service. `--execute-approved-unpaid` only accepts explicit HTTPS mode, a reviewed n8n cloud origin and non-synthetic private authorities. Neither mode installs workflows, creates scopes, changes settings or grants human approval. **Do not run the live mode under the current authorization.** Its existence is dormant source preparation. A hash supplied by an operator is an integrity binding, not proof that Jeff approved it.

The coordinator snapshots the validated context over IPC, not argv/environment, and suppresses child stdout/stderr. An independent monitor must report armed before a primary is spawned. Its detached process group survives a coordinator's terminal-group SIGINT/SIGTERM; IPC disconnect or deadline triggers scope close, owned-timer stop and independent readback. Signals latch a stop before primary creation. The launcher waits for both a successful primary and verified monitor closure; uncertain cleanup is a failed result, never an automatic retry. Do not use a supervisor that kills the monitor together with the primary. Direct monitor death, host loss/power loss and arbitrary external operators remain limitations; an external owned close procedure is still required.

Only status enums/digests/counters are retained by the primary journal; the launcher prints a minimal terminal result. No debug exception or remote response is printed. Keep context/journal permissions and independent monitor process ownership under operator control.

## Exact live package still required

The generated readiness artifact lists eight blocking prerequisite groups. Complete them only under new authorization: pin current main/serving/migrations, verify no-funding/message suppression, configure missing status key, install diagnostic-only credentials/workflows and prove authenticated no-op, create fresh controlled intake/approval rows and immutable artifacts, bind exact scope/member/workflow/deadline/context hashes and independent closure/reconciliation commands, obtain the specific $0 draft-only approval, and approve any additional quote-only transport/budget. No such facts are invented or refreshed here.

Cases: website single viaW4, Amazon single viaW4, Amazon two siblings viaW4.1. Require distinct four PDF roles, exact edition/product/recipient/service/quantity, terminal n8n execution, owned artifact bytes, new provider held draft/financial state, original provider files, prepress evidence where available, child/item/root mappings, full signed-in admin inspection and actual successful registered recurring status. Document exactly which W0/W3/preview/approval/ordinary scheduling stages executed; prepared diagnostic substitutions are not their proof.

Per case, independently arm the monitor; acquire durable ownership; verify fresh bindings and OFF controls; run scoped queue once; assemble; independently verify frozen bytes; quote/create held draft once; verify provider and mappings; register/observe owned status; close scope/parent first; stop owned timer; verify registration/lease closure and OFF settings/runtime/gates. A timeout/unknown response never allows resend. Failed closure stops all later cases. Reconcile only exact owned references under a separately approved read-only procedure. Never inspect or reconcile the six excluded orders.

## Shipping/pricing proposal, separate from the core runner

Three cases times three configured tiers means **nine total quote comparisons**: three primary native workflow quotes plus six additional quote-only comparisons. The primary runner performs only the three primary quotes and at most three held-draft creates. Do not multiply the create stage by every tier. Alternative quote transport is not installed or executed by this phase. Unsupported destination/tier tests currently prove local refusal, not a fresh provider refusal.

The offline matrix uses standard=`usps_ground_advantage`, priority=`usps_priority_mail_standard`, expedited=`ups_2_day`. It traces canonical request -> selected quote -> normalized money -> exact held-draft files/quantities. Aggregate product line prices are not multiplied again by quantity. Alternatives retain price, initial price, estimated delivery and parcel counts. Split-parcel and reprice scenarios are synthetic; retained real quotes all reported one parcel. Destination/address and item/file binding still require fresh live evidence.

Retain product/shipping deltas and raw receipt tax/packaging/discount totals as candidate observations. This offline helper cannot authenticate receipt account/order/item ownership, even if `isCalculated=true`; it keeps that prerequisite unresolved. Missing amounts and sub-cent USD precision remain unknown, not zero. No live final payable adapter, binding pre-conversion total, tax guarantee or provider-enforced spending cap is implemented. Obtain the provider answers described in the October19 final-pricing/physical-proof document before enabling any paid path.

Finalize all call/byte counts in the concrete packet, including every backend/n8n call, provider status GET and original-file reread during refresh/recovery. The old four-original-file shorthand is not a global cap when polling rereads files. Existing adapter limits are enforced but do not by themselves approve the proposed window budget. No broad order or execution search, arbitrary RPC or regular conversion is included.

## Later gates

Once the above packet is actually ready, obtain installation/configuration and exact live-window approval. Keep ordinary ordering closed throughout. Provider no-payment/prepress boundaries must be observed and labelled precisely. Paid proof remains separate: proposed two fresh orders/three books, actual final costs/cap mechanism, recipient privately confirmed, funding isolation that cannot release pending orders, Jeff's specific approval, then actual charges/printing/tracking/shipment/delivery/inspection. Live cancellation needs separate approval. Polling remains primary; real webhook delivery is optional and unproved. Jeff's entire plan is not complete.
