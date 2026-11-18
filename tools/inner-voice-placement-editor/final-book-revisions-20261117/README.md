# Final book revision candidate

This isolated authoring revision preserves the original editor's saved revision1481 and published v4. `lettering-data.json` and `lettering.json` are the approved v2 seed and saved draft (initial revision1482); edit these together using the existing v2-aware lettering tooling. Do not synchronize them through the older canonical v1 seed generator. `copy-revision.json` binds the approved change scope and baseline hashes; the existing reviewed-copy exporter rejects stale seed/source copy and unlisted edits.

`source-config.json` is the immutable v4 source. The builder exports saved copy, adds front/back matter and cover layers, and writes a new `candidate-config.json`. It does not activate a database version or update an order. Local maps/source paths are ignored. Originals, slide art, baked character shadows, hero placement and accepted characters are not replaced by this builder.

Run from the repository root (Pillow required, already available on this workstation):

```sh
python3 tools/inner-voice-placement-editor/build_final_book_candidate.py --directory tools/inner-voice-placement-editor/final-book-revisions-20261117 --asset-map /absolute/path/to/verified-local-asset-map.json
```

The result stays DRAFT. `--release` requires mappings for both pages and all eight guides in `trails.json`, and writes the separate `release-config.json` active-status publication artifact. It does not publish it. Config/recipe validation, resolved proof/PDF, immutable uploads and publication gates remain required. Merely satisfying this structural guard is not visual approval. `trails.json` should name reviewed files in assets/; its provenance belongs beside it. Rejected experimental right-page-only drafts are retained in the ignored local QA output; final native edits use one common spread.

The approved title copy declaration contains one explicitly empty stable block. The original raster already contains its complete lettering; this satisfies active recipe admission without duplicate live text. The editor permits this exact empty declaration only where the approved v2 seed declares it.

The original title-page file is an exact copy of the shorter book's page00-title-page.png: ISBN978-1-257-01679-2, original November17,2025 publication/copyright lines. `lhl-color-mark.png` matches the book/flask mark used by the book. White blank and small cover backing are deterministic code-native assets. The dedication is order input, not baked globally; the local Luca proof supplies “Luca, we love you!” through W0.
