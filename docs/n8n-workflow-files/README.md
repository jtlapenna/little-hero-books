# n8n Workflow Files

This folder now has three distinct roles:

- [`archive/finals-legacy-2026-03-18`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/archive/finals-legacy-2026-03-18)
  - snapshot of the committed `finals` workflow JSON files before the sibling exports became the active n8n-centric source of truth
  - use this as the repo-side rollback snapshot
- [`sibling-orders/sibling-order-n8n-workflows`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows)
  - current working master workflows for the n8n-centric path
  - ongoing workflow edits should land here first
- [`repo-centric`](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric)
  - staging area for the thinner n8n / repo-owned method as more workflow decisions move into backend routes

Important note:

- the legacy `finals` folder still exists in place today, but it should be treated as a legacy reference set, not the active edit target
- if an exact live-n8n rollback snapshot is ever needed, export those workflows from n8n directly and store that export alongside the archive snapshot here
