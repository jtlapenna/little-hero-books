# Shared-spread clue artwork direction

This records the final art direction and output mapping, not a verbatim tool-call transcript. Built-in OpenAI imagegen edited background art only; no Gemini or child generation was used.

Common brief: edit the supplied full 2:1 forest spread, preserving the painted scene, trees, foliage, sky, stars, palette and camera. Replace only the clue trail with one continuous gently curving trail. The center join must preserve height, scale, direction and spacing, near 76% of the image height. Perspective shrinks gradually with distance. No text, people, gutter, panels or new scenery. Keep upper illustration intact. Processing subsequently restores exact source upper pixels and reapplies the approved existing right-page character shadow once.

| Final native file | Clue direction | Guides |
| --- | --- | --- |
| assets/trail-native/paw.png | Dark paw prints, paired natural alternating spacing | cat, dog, lion, tiger |
| assets/trail-native/owl.png | Brown and cream feathers along the same path | owl |
| assets/trail-native/penguin.png | Black and white feathers along the same path | penguin |
| assets/trail-native/unicorn.png | Pastel sparkling wisps along the same path | unicorn |
| assets/trail-native/trex.png | Three-toed dinosaur tracks along the same path | t-rex |

See trail-provenance.json for the native/source/final hashes and process_final_book_trails.py for exact crop/mask/shadow processing. Source images and rejected drafts remain preserved locally. Final sixteen crops are bound by trails.json; native edits are not runtime page assets.
