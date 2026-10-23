# Controlled pipeline source evidence

The controlled W0, W1 and W2A changes alter two paths covered by the earlier Gelato auth evidence: the run-manifest builder and W1 workflow. The two CI files also change to use this successor. Updating old hashes would erase the distinction between the earlier checks and this release.

This folder retains the earlier evidence unchanged and binds the full prior source set plus the controlled pipeline runtime, migration, workflow, tests and CI files. `checks.json` records actual local commands, exit codes and output hashes against that source snapshot. `run.py` captures those checks with only `HOME` and `PATH` inherited. `verify.py --source` verifies current hashes, prior coverage, exact suite commands, successful exits and recorded outputs, then verifies the retained auth evidence without asserting its source parity.

The reruns use synthetic services, VM fixtures, loopback worker processes and disposable local PostgreSQL. The activation test exercises the canonical table schema, atomic installation, caller grants and null identity rejection. The isolation suite uses short child names and retains distinct order IDs. The handoff tests cover frozen W0 selection, W1 recovery and claim guards, W2A identity checks, publisher immutability and adaptive name validation. This evidence does not renew the earlier 260-check claim, typecheck result or any live receipt. Full application TypeScript health is outside this package.

No live credential test, provider request, production order, hosted workflow change, deployment or print action is part of these checks. Prior live acceptance restrictions remain in force. These files grant no execution or installation authority. The production route diagnostic and controlled rollout need their own observations and release review.

From the repository root:

```sh
python3 docs/repo-workflows-planning/controlled-pipeline-source-evidence-2026-10-22/verify.py --source
```

To reproduce the local suites, install the locked backend dependencies first, then run:

```sh
python3 docs/repo-workflows-planning/controlled-pipeline-source-evidence-2026-10-22/run.py
```

The PostgreSQL tools `initdb`, `pg_ctl` and `psql` must be installed. The recorded isolation command binds local PostgreSQL 17 at `/opt/homebrew/opt/postgresql@17/bin` and sets `LC_ALL=C`; hosted CI runs that suite in its pinned PostgreSQL 17 container. Rerunning writes local logs and `checks.json`; it does not refresh the reviewed manifest. A source change must fail verification until a new review binds the new source and test results.

Alignment assessment: fix now. The stale source pin blocked a changed pipeline even though the historical evidence remained valid. A successor follows the existing evidence pattern and preserves that history. No broader evidence refactor is included.
