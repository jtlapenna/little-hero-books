# Repo-Centric Workflow Copies

These are the workflow exports currently carrying repo-centric route calls.

Current files:

- [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
- [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
- [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)

Current webhook paths:

- `order-intake-repo`
- `2a-start-repo`
- `bg-removal-repo`

Source:

- each file may start as a one-time derivation from the sibling workflow folder, then continue evolving here for the migration track

Purpose:

- preserve the thinner n8n / repo-owned variants
- keep repo-centric migration edits in one canonical export set
- allow the sibling workflow folder to be refreshed from live n8n exports for the legacy n8n-centric path
