# Prompt for John and his agent

Draft only. Not sent.

We are narrowing Jeff's work to a new-book test from Amazon order upload through n8n, Gemini, Bria and PDFMonkey, ending at review PDFs. Website checkout/payment recovery and new intake/checkout SQL drafts are set aside. Everything remains uncommitted and automations paused. We have not run the hosted chain or authorized uploads, deployments, print orders/drafts or customer messages.

We compared local HEAD `f7efbb3308df1111568890ed6de9ae5c7c38fe74` with main `98e50d913a622e8fb18b06b9f3f67413f1418490`, including PR #64. Please confirm:

1. What branch/head and unpublished changes should we use as your current baseline? Who owns edits to `back-end/package.json`, `back-end/src/lib/workers/w3-manifest-publish.ts`, `back-end/scripts/test-configured-w3-boundaries.ts` and `back-end/scripts/test-configured-w3-pipeline.ts`? Our book work overlaps these four files. We will preserve your revision/reapproval invalidation and print guards.
2. Does your current Amazon CSV/TXT uploader support selecting the new book? Our source hardcodes `book-mvp-simple-adventure` in `/api/admin/amazon-orders/upload-csv`, including W0 dispatch. Is there a newer SKU/ASIN/book mapping? Please provide its source path and expected new-book/edition IDs. If absent, who should make the smallest compatible selector change?
3. Which environment and exact active n8n workflow IDs/versions should this test use? Are SIBLING or repo-centric workflows authoritative for intake, queue, W2A, W2B and W3? Which PDFMonkey templates and new-book rendering configuration are connected? Please share identifiers and paths, not credentials.
4. Can we use a synthetic Amazon-format file and matching customization ZIP through the same authenticated multipart upload endpoint? Please provide a sanitized representative CSV/TXT plus ZIP/JSON schema, allowed test order IDs and fixture-hosting method. We want the same parsing, order creation and W0 path as an uploaded Amazon order, without buying anything from Amazon.
5. Which existing test controls permit actual Gemini, Bria, storage and PDFMonkey execution but prevent all customer/Amazon messages, payment, print orders and drafts? The SIBLING exports generate page/cover PNGs in W3 and cover/interior PDFs in W4. Can we run that PDF-generation segment and stop before submission? Please include queue/reminder/W4 behavior. Which test flags bypass providers or reuse cached assets? We need new provider outputs for the pilot.
6. Is the new-book flow layout supported in the active W3/PDFMonkey path? Our local publisher explicitly refuses `lhb.book-render@v2`; local W4 also holds unverified flow fit. Which book-specific work remains before a review PDF can finish without weakening print guards? Are final assets required for a first provisional service-chain test, or can the approved existing artwork be used?

Proposed pilot: Alexandra, deep skin, black afro, purple shirt, Cat, Amazon edition. Then James/Owl, short name A/Dog and long name Alexandria Isabella Montgomery/Unicorn, with their previously selected appearances. Check hands-over-heart cover, flying orientation and text consistency on every result. Please identify unsupported selections and required review steps before execution.

We will present the exact target, input files, bounded provider cost and stop controls to Jeff before external execution. Please reply with confirmed facts, source paths and remaining unknowns. No implementation or external action is requested by this message.
