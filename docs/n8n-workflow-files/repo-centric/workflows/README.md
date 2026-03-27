# Repo-Centric Workflow Copies

These are the workflow exports currently carrying repo-centric route calls.

Current files:

- [w0-Order_Intake_Validation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json)
- [w2A-Orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json)
- [w2A-SW1-Pose_Generation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json)
- [w2B-main-orchestrator.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json)
- [w2B-sw1-single-pose.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json)
- [w3-Book-Assembly.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json)
- [w4-PRODUCTION-Print_Fulfillment.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4-PRODUCTION-Print_Fulfillment.repo-centric.json)
- [w4.1-Sibling-Aggregation.repo-centric.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4.1-Sibling-Aggregation.repo-centric.json)

Current webhook paths:

- `order-intake-repo`
- `2a-start-repo`
- `bg-removal-repo`
- `book-assembly-repo`
- `w4-pdf-print-repo`
- `w4-1-sibling-aggregation-repo`

Source:

- each file may start as a one-time derivation from the sibling workflow folder, then continue evolving here for the migration track

Purpose:

- preserve the thinner n8n / repo-owned variants
- keep repo-centric migration edits in one canonical export set
- allow the sibling workflow folder to be refreshed from live n8n exports for the legacy n8n-centric path

Subworkflow note:

- the new `W2A-SW1` and `W2B-sw1` repo-centric copies are execute-workflow subflows, not webhook entrypoints
- importing them into n8n will still require a one-time rebind from the repo-centric top-level orchestrators so `Execute SW1 - Pose Generation` and `Execute Workflow: s2B-sw` point at the new subworkflow copies
