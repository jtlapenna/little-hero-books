# Read-only preparation evidence

This package records current workflow-definition metadata, control settings, local frozen dummy PDF hashes and independent inspection. No live workflow was run, no order read, and no provider request or mutation made. It is not fresh provider fulfillment proof. Main and serving backend differ as documented; no deployment occurred.

- `workflow-and-controls.json`: 29 definition GETs/21 known LHL workflows, exact versions, legacy queue destinations, inactive Gelato copies, fresh OFF metadata and source baseline. No credential values, raw nodes, pinned/static execution data or customer records are included.
- `frozen-fixtures.json`: four distinct PDF hashes/byte lengths, proposed child identities, product, edition and quantities. Private artifacts were not uploaded; planned IDs are not claims or live records.
- `pdf-inspection.json`: 140 page boxes/order/blank checks and 132 decoded pixel associations, plus primary-agent visual review of all four contact sheets. It does not claim independent human, creative or provider approval.
- `source-bindings.json`: source hashes for the local assembler/config and source-grounded queue/status blockers.
- `manifest.json`: checksums of the evidence, verifier and run sheet/audit copies, excluding itself. This guards accidental corruption, not authenticity against someone who can rewrite both files.

The original checkout's private `.gelato-testing/live-test-prep-20261019/` directory holds read-only PDFs under `output/pdf/`, labelled PNGs under `rasters/`, Poppler contact sheets/full-size selected pages under `renders/`, local preparer, sanitized detailed metadata and inspection helper. Directory mode is 0700; credentials remain in their separate existing protected locations and are not copied into this package. No recipient address is published.

Offline metadata verification:

```sh
python3 verify.py
```

With the private artifact directory and pypdf available, verify exact PDF bytes, owner-read-only status, page boxes, image counts and blank pages:

```sh
python3 verify.py --private-dir "$PRIVATE_PREP"
```

For full independent decoding/source-image comparison (132 associations; slower; requires Pillow as well):

```sh
python3 verify.py --private-dir "$PRIVATE_PREP" --pixels
```

The original inspection also rendered every page with Poppler `pdftoppm -png -scale-to 600` and selected pages at 72 dpi, then visually inspected the four contact sheets. Full decoded source equality plus the frozen PDF hash binds page identity; thumbnail review alone is insufficient to read tiny labels. Re-run rendering from the frozen bytes for human QA. Bundled runtime pypdf/Pillow/Poppler were used without installing dependencies. These offline commands do not re-run hosted workflows, check funding, access account dashboards, retrieve provider files or prove provider prepress.

Re-creating fixtures is optional and may vary with font/rasterizer versions. To reproduce preparation, use the committed `back-end/scripts/create-gelato-local-rasters.ts` for four roles/run `PREP-20261019-FROZEN`, then the protected retained `prepare-frozen.ts`, which injects only local image/object storage and denies fetch. Use a new directory and update that copy's output constant; never overwrite frozen originals. Source/config bindings are recorded. Do not use that synthetic preparer as a real W0/W3 intake or reuse its planned keys as live grants.

See the parent audit and run sheet for the missing hosted native queue patch, shared-OFF admission/polling boundary, credential/funding gates and future approval requirements. No support message has been sent. Normal controls remain OFF and six pending orders remain excluded.
