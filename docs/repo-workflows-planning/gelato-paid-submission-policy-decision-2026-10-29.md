> Historical phase093 record. John selected policy A; implementation and QA are complete locally. See [current estimate-policy results](gelato-estimate-test-print-results-2026-10-29.md). The earlier state below is preserved.

# Required paid-submission policy decision — October 29, 2026

This is an implementation-policy choice, **not approval to purchase, fund, convert, print, ship or activate anything**. Current live controls and the installed paid endpoint remain OFF/blocked. The disabled local service bridge and fresh-quote fix passed independent QA; the actual monetary resolver depends on this choice.

## What the provider contract establishes

[Gelato quote API](https://dashboard.gelato.com/docs/orders/v4/quote/) documents product and shipping prices. [Draft conversion API](https://dashboard.gelato.com/docs/orders/v4/patch/) documents converting an exact draft using orderType=order. Those reviewed pages do not document a binding tax-inclusive final charge or a maximum-charge argument. This is a documentation limitation, not a claim that no other provider arrangement could establish one.

The existing strict core currently requires verified product, shipping, tax, fee, discount and total evidence. Its numerical threshold can reject a preflight quote; the PATCH contract does not establish an atomic provider charge cap. Synthetic complete totals in QA prove our logic, not Gelato's real financial guarantee. Calculated draft receipts were not established as binding final payable evidence and cannot be silently promoted to that status.

## Choose the boundary for the eventual specifically approved test print

**A — Allow disclosed estimate-based approval.** Build a separate explicit policy in which the operator reviews the exact draft/files/recipient/service and product/shipping estimate, acknowledges that tax, fees and the final Gelato charge may differ, and then specifically approves that one order. Do not call the estimate a guaranteed total or promise an unenforceable hard cap. This requires changing the current full-total policy deliberately, additional focused QA and later publication/activation review. It grants no purchase now and sets no new numeric amount/tolerance by implication.

**B — Require verified final-total evidence.** Keep the strict policy. Finish the real resolver only when a trustworthy provider commitment/contract can establish the payable total and its approval semantics; otherwise submission stays blocked. Merely changing files, adding a card or having a zero wallet does not satisfy that condition.

John may instead specify a different finite boundary or keep this bookmarked. No choice authorizes a charge tonight. We will not start another fixture loop while waiting. After the policy is implemented and reviewed, publication/activation and an exact real order still need their own current approval. Jeff's actual book must also be rendered and inspected.

## Verified local work

Independent QA passed19 service,11 application and61 core checks with all service transport intercepted, plus existing conversion regression. Installed live runtime remains blocked before credentials or service access. Version2 SQL packets/old evidence were preserved. [Results](gelato-paid-submission-local-results-2026-10-29.md).
