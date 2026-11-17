# Recover a stopped character run in the admin

Open the order and choose **Open W2A Recovery**. Inspect the existing order; do not import it again or use Force Regeneration to resume a partial run.

For a supported interrupted pose run, **Resume interrupted poses** shows the existing poses to keep and the poses to continue. Confirm that the failure cause has been fixed. **Check resume readiness** verifies the stopped execution, frozen book selection, retained images and job history, then saves a plan without generating images. The confirmation resets when that check changes the order revision.

Review the saved plan, confirm the cause is fixed and acknowledge image-generation credits, then choose **Resume remaining poses**. That is the action that starts generation. It continues at the saved rejected pose and preserves the earlier published images and base character. Open the order to monitor progress. A defective earlier pose can be flagged and regenerated individually during pose review after the continuation finishes.

A reserved or already accepted continuation cannot be started a second time. If a request has an uncertain outcome, refresh and inspect the current order/execution; do not repeatedly click or reset. The console displays available failure evidence and blocks another dispatch. Some failure shapes cannot be safely continued automatically; they stay held with an explanation rather than silently starting the book over.

For an empty run that failed before any generated assets, the separate resolved-cause retry can queue W2A through the router. For fully completed, verified poses whose parent stopped before closing, **Finalize 2A** returns them to review without generation. These are distinct from partial continuation. Existing stage recovery/regeneration retains its own ownership and review requirements; this change does not enable printing or approve the book.

Regenerate 2A is a full regeneration control. It clears stage assets and is blocked during a W2A failure hold. Use the recovery link beside it for a stopped run.
