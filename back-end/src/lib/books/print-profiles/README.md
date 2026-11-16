# Embedded print profiles

Unaltered ICC profiles are stored with zlib compression and base64 encoding for the canonical Worker PDF assembler. The loader verifies expanded size, ICC header, channel count and SHA-256 before embedding. The PDF references sRGB2014 as the source RGB color space and GRACoL2006_Coated1v2 as its output intent. Image samples and PNG IDAT streams are preserved.

- sRGB2014: downloaded from the [ICC registry](https://registry.color.org/rgb-registry/profiles/sRGB2014.icc), SHA-256 `384b832de3412066743b52a75ee906b6fb9fb8d9e09e936fc2c43223815c6e0a`. Copyright International Color Consortium, 2014. The [ICC profile library license](https://registry.color.org/profile-library/) permits copying, distribution, embedding, use and sale without restriction; altered versions must remove original identification/copyright and must not be misrepresented as the original. This profile is unaltered.
- GRACoL2006_Coated1v2: retained approved print-finishing profile, SHA-256 `7f822b354f3f4081e3b1dadd381c9f16d583257d1574e583be7d0e3433a6b45b`. Copyright X-Rite, Inc. and IDEAlliance, 2006. The embedded copyright and [ICC registration](https://registry.color.org/profile-registry/GRACoL2006_Coated1v2) permit use, embedding, exchange and sharing without restriction; alteration or sale requires permission. This profile is unaltered and is not sold separately.

These profiles provide color interpretation; actual output still depends on the printer. Structural and decoded-pixel preflight is distinct from independent PDF/X certification and physical print approval.
