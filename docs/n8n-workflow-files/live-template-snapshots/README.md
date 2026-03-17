# W3 Cover PNG Template Snapshots

These files mirror the live PDFMonkey PNG cover templates used by W3.

- Standard / D2C template ID: `D0F07D93-9267-47BB-A6AF-D6EC5ACDF476`
- Amazon template ID: `8DB1D274-AA3C-4E14-B051-65B6F872B013`

Files:

- `w3-cover-png-template.html`
- `w3-cover-png-standard.scss`
- `w3-cover-png-amazon.scss`

The HTML template is shared by both cover PNG templates. The SCSS differs by route.

Implementation note:

- Standard / D2C cover keeps all front text dynamic.
- Amazon cover background art (`page00-covers-barcode.jpg`) already contains the fixed title and byline, so the live Amazon template only renders the dynamic personalization block (`A Story Made for` + child name).
