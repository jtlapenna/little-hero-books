# Approved back cover — version 6

Jeff selected option B (soft landscape fade) and approved the revision with both “Made with love for” and the child's name centered above the combined logo and URL on November 18, 2026.

This is a cover-only successor to the immutable final-book version 5. The builder pins that source's exact SHA-256 and asserts that restoring the cover recipe, overlay slots, version and status gives back the exact original configuration. Interior pages, character poses, story copy, slide artwork, animal trails, shadows and print geometry are unchanged. Existing frozen orders are not rewritten.

Run `python3 tools/inner-voice-placement-editor/back-cover-20261118/build.py` from the repository root to reproduce the draft and its single content-addressed fade overlay. The new cover uses the existing renderer's cream type and soft-shadow treatment, with no runtime/schema extension. Both cover formats share the same imprint coordinates. Its center is x=686.5, calculated from the visible logo at x=260 and URL ending at x=1113. Name fitting uses the existing 12-character threshold and 0.4 minimum scale to preserve a single line for the tested 30-character wide-letter case.

The small `check-name-cases.ts` adds six offline W0→W3 cover fixtures (12, 14 and 30 uppercase M characters, in both formats) to the existing final-book proof export. Invoke it with the back-end tsconfig and explicit local `--source-w0`, `--source-2b`, `--asset-map` and `--output` paths. It forbids network access; those private order inputs are not committed. Full proof review also covers Luca, accented names and 30 uppercase W characters. The resulting 95 proof cases include 83 byte-identical non-cover cases from version 5.

Publication uses the existing hash-pinned `back-end/scripts/release-inner-voice-print-test.ts` file-based release flow. Upload only the new fade asset, verify every mapped static asset, then publish and activate version 6. Do not use the bundled v1–v3 config publisher, overwrite an existing version, or rewrite an in-progress order's frozen snapshot. Provider submission remains a separate order action.
