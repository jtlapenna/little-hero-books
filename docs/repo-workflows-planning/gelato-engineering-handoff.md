# Gelato engineering handoff: steps 1 through 4

Sendable message for John and his agent. Companion: [full next-phase plan](gelato-next-phase-plan.md). Jeff and his agent own book finishing separately. Private journals and release receipts are outside Git; request a redacted transfer from Jeff if needed.

## Message

John and agent,

Please take ownership of the Gelato engineering work below, covering steps 1 through 4 of the full phase plan. Jeff and his agent will separately finish the book's copy, artwork and layout.

Goal: prove W4 and W4.1 can create correct, unconverted Gelato drafts and recover from failures without duplicate orders or customer messages.

### Current state

- Repository: `jtlapenna/little-hero-books`.
- Last verified implementation commit: `4fb98c265bdad3482d6b9e31033437c8b18dce53`. Check current main before starting.
- Gelato workflow copies and supporting submission/recovery code already exist. Continue that implementation.
- Two defects were fixed and deployed: runtime delivery of the draft-enable setting, and comparison of equivalent fresh/persisted quote requests.
- Latest failed native W4 run created its PDF and quote, then returned a generic 409. No provider submission was recorded. The exact failed check remains unknown.
- Two direct API draft proofs succeeded outside n8n. Successful native W4 and W4.1 proofs remain outstanding.
- Saved baseline has all five Gelato runtime switches false, database dispatch false and both workflow copies inactive.
- No separate sandbox account/key has been verified.

### Your scope

1. Confirm testing setup and isolation. Verify Gelato's actual sandbox behavior. Review isolation before persisting sandbox submissions or using recovery/polling. Current lifecycle clients default to the production key, and submission records lack an account/environment discriminator. Keep test account identity consistent across all operations.

2. Prove runtime enable/disable delivery. Adapt the existing diagnostic runner for the repaired Wrangler configuration delivery. Verify true and false request-time behavior while dispatch remains closed and workflow copies inactive.

3. Complete native workflow proofs. Use fresh, owned synthetic orders: website single-child, Amazon single-child, and Amazon two-child sibling orders. Verify PDFs, shipment selection, quotes, complete provider graphs and database mappings. Capture raw financial status for every connected order; normalized responses omit that field. Distinguish sandbox results from live held-draft evidence. Restore and verify all controls after each window.

4. Verify lifecycle and recovery. Cover ambiguous responses, failed persistence, duplicate/delayed events, concurrent claims, expired leases, incomplete sibling graphs and file mismatches. Reconcile uncertain acceptance before another create attempt. Preserve the existing restriction that held drafts cannot be cancelled. Use mocks or compatible isolated sandbox orders for cancellation and later production states.

### Boundaries and working method

- No paid conversion, printing, customer messages or public book activation.
- Do not change copy, artwork, character placement or creative configs. Coordinate interface needs with Jeff's agent.
- Preserve existing Lulu routing and historical test evidence.
- An old Cloudflare deployment record currently blocks the protected production test runner. Its deletion remains unapproved. Recheck it and obtain explicit approval before deletion; local work can proceed meanwhile.
- Coordinate credential replacements with their consumers and obtain approval before swapping credentials.
- Follow repo instructions. Use rigorous-build, proportional adversarial reviews and release-safety-review before Git publication. Preserve the repository's personal GitHub account boundary.
- Begin by reconciling current source, saved evidence and live state. Write bounded checkpoint plans for the remaining runner and isolation changes.

Please report completed proofs, restored controls, remaining blockers and exactly what you need from us. Treat final book readiness, paid printing and launch as separate later work.
