
# Renderer Service (MVP)

A tiny HTTP service with one endpoint: `POST /render`.
- Input: manuscript JSON + asset URLs.
- Output: `bookPdfUrl`, `coverPdfUrl` (written to local `out/` for MVP).

> This is a stub using HTML templates and Playwright print-to-PDF. For production, consider PrinceXML or a hardened pipeline.
