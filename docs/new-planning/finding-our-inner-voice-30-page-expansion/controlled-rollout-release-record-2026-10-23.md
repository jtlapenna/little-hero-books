# Controlled rollout release record, October 23, 2026

Core W0, W1 and W2A rollout is complete. Production now selects existing W0 `9E0oVs46bMoiyRIP` at `/webhook/order-intake-repo`. New-book sales and all six Gelato controls remain off. Both Inner Voice configs remain inactive drafts.

## Released source and route

[PR 55](https://github.com/jtlapenna/little-hero-books/pull/55) released the authenticated route diagnostic. It revealed the inactive sibling destination. [PR 56](https://github.com/jtlapenna/little-hero-books/pull/56) added frozen selection and revision-guarded handoff. [PR 57](https://github.com/jtlapenna/little-hero-books/pull/57) fixed the W0 character-hash mapping and replaced unsupported Code-node `fetch` with n8n's HTTP helper. All 12 PR 57 checks and six merged-source workflow runs passed.

Released source is `c9b939f6a25bda6fa1ee4090973cea2c924c5450`. First backend deployment [39909451756](https://github.com/jtlapenna/little-hero-books/actions/runs/39909451756) preceded the graph updates. A single partial Cloudflare update changed only the production W0 setting and preserved other environment metadata. Same-source redeployment [39980026162](https://github.com/jtlapenna/little-hero-books/actions/runs/39980026162) succeeded. Canonical production deployment is `ff636e00-f178-4eb2-8e2a-976172782700`.

Live diagnostic returned 401 anonymously and 200 with the existing backend credential. Its response is `private, no-store`, with target `selected-w0`. This proves the current shared runtime setting after redeployment, not historical customer routing. No credential value appears in this record.

## Controlled graph changes

W1 paused first, then W2A. Complete execution-history checks found no nonterminal executions. Queue checks found no ready or pending-W0 orders. Three existing processing rows belonged to known Gelato tests at workflow 4. Counts remained unchanged.

The backend deployed before W2A, W1 and W0 publication, in that order. Each saved and published graph matched its reviewed candidate. Dynamic workflow state stayed unchanged.

| Workflow | Existing ID | Published version | Nodes |
| --- | --- | --- | --- |
| W2A | `HduzTWm0ekmrvwrn` | `85e0e69f-1850-4a5d-ae97-6bc9dac7ccd3` | 39 |
| W1 | `TDwc85g03FqPf9D6` | `40687e4b-b4a5-4a46-886a-4bec0743afdf` | 28 |
| W0 | `9E0oVs46bMoiyRIP` | `59ad5e54-6305-4679-b3f9-b06a18a12099` | 14 |

W1 retains its existing legacy print branches. The separate native Gelato queue extension was not installed in this core release. No shared backend token was rotated.

## Verified behavior

Three live smoke requests ran once each. W0 execution `54764` rejected conflicting selection before its first HTTP node. W1 execution `54765` completed with zero extracted orders. W2A execution `54766` rejected a missing order ID before context, storage or provider work. Exact request bodies, published versions, descriptor-expanded captured graphs, node traces and unchanged workflow state passed verification. SQL confirmed zero rows for the synthetic W0 order.

Two preflight attempts stopped during reads before sending a new request. The verifier also initially rejected n8n's hosted error-record format. It now checks terminal timestamps, exact protected error fields and pinned default-expanded parameters. Independent review and 42 synthetic cases cover that correction and explicit reconciliation. Existing executions were reread; no recorded request was resent. Private journals retain the original failures and recovery history without raw execution data.

The isolated HTTP and PostgreSQL proof passes standard, Amazon and legacy fixtures through W3 assembly input. Both Inner Voice fixtures retain 32 pages and matching frozen character identity. Six actual local n8n cases prove supported transport, failure holds and retry. These checks supplement the live no-order tests; they do not prove a full hosted business-order run, provider output, rendered W3 pages or print quality. Full application typecheck still has baseline errors; production builds and focused release checks pass.

The four-argument invoker activation RPC is installed and executable by service role only. Current book drafts remain inactive. This rollout activated no book config, enabled no new-book sales, sent no customer message and submitted no print order.

## Remaining gates

Release and verify the native Gelato queue and print workflow extension separately. Complete an isolated generation and rendered-book proof before launch. Final cover and page copy still need approval; the Amazon product ID is needed for the Amazon channel. Final config activation, sales and printing require their later release checks. Existing malformed frozen identities remain held and must not be repinned during retry.
