# Cloudflare Pages Configuration - Fixed Output Directory

## Issue
When the **Build output directory** is fixed and unchangeable at `/back-end/.open-next/cloudflare` (relative to repository root), the **Root directory** must be left **empty**.

## Correct Configuration for `little-hero-labs-admin`

Since the output directory is fixed at `/back-end/.open-next/cloudflare`:

### Settings:
- **Root directory**: **(Leave empty)** ⚠️
- **Build command**: `cd back-end && npm ci && npm run pages:build`
- **Build output directory**: `/back-end/.open-next/cloudflare` (fixed, unchangeable)
- **Framework preset**: `None`

### Why This Works:
1. Root directory empty = Cloudflare runs from repository root
2. Build command navigates into `back-end/` and runs the build
3. Build creates output at `back-end/.open-next/cloudflare` (relative to repo root)
4. Cloudflare finds output at `/back-end/.open-next/cloudflare` (matches the fixed path)

### Why Setting Root to `back-end` Fails:
- If root is `back-end`, Cloudflare looks for output relative to `back-end/`
- It would look for `.open-next/cloudflare` inside `back-end/`
- But the fixed output path is `/back-end/.open-next/cloudflare` from repo root
- This creates a path mismatch

