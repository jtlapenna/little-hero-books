# Unpaid quote evidence and offline reproduction

Four real V4 quote-only responses from October 19, 2026, have been redacted by explicit transformation. Provider opaque identifiers, recipient/contact fields, key identity and request references are replaced. Prices, quantities, product UID, API pageCount, exact service options, packageCount and dates are retained. Private originals remain owner-only outside Git; `originalResponseBodySha256` is the digest of each original response body, not the transformed JSON. Hashes authenticate file consistency, not provider origin by themselves.

The fresh distinct `.invalid` file URL labels were deliberate quote-only inputs. They are not downloadable book assets. No order create/get/search/patch/cancel API, PDF upload/validation, payment or messaging call was made. This evidence must not be used to claim a fresh W4/W4.1 execution or physical processing.

From `back-end`, with repository-supported Node 22.19+ (Node 24.5 used here) and locked dependencies:

```sh
node --import tsx scripts/test-gelato-pricing-replay.ts
node --import tsx scripts/test-gelato-api-contract.ts
node --import tsx scripts/test-gelato-financial-observation.ts
node --import tsx scripts/test-gelato-submission.ts
node --import tsx scripts/test-gelato-ordinary-release.ts
node --import tsx scripts/test-gelato-native-queue.ts
node --import tsx scripts/test-gelato-admin-inspection.tsx
```

The first command freezes time to the capture and blocks network use. The submission suite also proves provider errors/conflicting parcel counts cannot persist a quote, and saved expiry before preparation or at transport prevents provider create calls. The others use synthetic service dependencies. Never load private dotenv credentials to run them. Package wrapper: `npm run test:gelato-pricing-replay`; the same command is added to the future hosted financial-observation gate. No hosted CI run is claimed for this local diff.

`python3 verify.py` verifies the manifest and recorded receipts without networking or rerunning tests. It is an evidence-consistency check only. The full typecheck is not green: 388 inherited diagnostics, exact same baseline file/code/message multiset. Source fingerprint changes require fresh checks and an updated manifest.

Fresh live reproduction is separate: use new references and the approved private recipient with an intended account key, pin current product/edition/page count, allow only POST `/v4/orders:quote`, reject redirects, journal intent before each call, and run each configured UID policy against the real response. Do not replay consumed identities, touch the six old orders, substitute review PDFs, create/convert orders, enable controls or infer a payment approval from a quote. The protected original runner is retained privately; a reviewer need not possess its credentials to run offline checks.
