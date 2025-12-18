/**
 * Determine the correct next_workflow for an order based on its actual progress
 * 
 * This function checks the order's manifests, workflow_step, and review_stages
 * to determine where the order should be in the workflow pipeline.
 * 
 * Logic:
 * - If 3-manifest exists or book_assembly_completed → '4' (or '3' if postPdf not approved)
 * - If 2B-manifest exists or 2B completed → '3'
 * - If 2A-manifest exists or 2A completed → '2B'
 * - If 1-manifest exists but no other progress → '2A'
 * - Otherwise, keep current next_workflow or return null
 */

export interface OrderProgress {
  one_manifest_url?: string | null;
  manifest_2a_url?: string | null;
  manifest_2b_url?: string | null;
  manifest_3_url?: string | null;
  workflow_step?: string | null;
  review_stages?: {
    preBria?: { status?: string };
    postBria?: { status?: string };
    postPdf?: { status?: string };
  } | null;
  next_workflow?: string | null;
}

export function determineNextWorkflow(order: OrderProgress): string | null {
  // Priority: Check highest workflow first (3 → 2B → 2A → 1-manifest)
  
  // 1. Check if order has completed workflow 3 (book assembly)
  const hasWorkflow3 = !!(
    order.manifest_3_url ||
    order.workflow_step === 'book_assembly_completed'
  );
  
  if (hasWorkflow3) {
    // If postPdf is approved, go to workflow 4 (print)
    // Otherwise, go back to workflow 3 (needs review/approval)
    const postPdfStatus = order.review_stages?.postPdf?.status;
    if (postPdfStatus === 'approved') {
      return '4';
    }
    return '3';
  }
  
  // 2. Check if order has completed workflow 2B (background removal)
  const hasWorkflow2B = !!(
    order.manifest_2b_url ||
    order.workflow_step === 'bria_processing_complete' ||
    order.workflow_step === '2B-complete'
  );
  
  if (hasWorkflow2B) {
    // If postBria is approved, go to workflow 3
    // Otherwise, keep at 2B (needs review/approval)
    const postBriaStatus = order.review_stages?.postBria?.status;
    if (postBriaStatus === 'approved') {
      return '3';
    }
    return '2B';
  }
  
  // 3. Check if order has completed workflow 2A (character generation)
  const hasWorkflow2A = !!(
    order.manifest_2a_url ||
    order.workflow_step === '2A-complete' ||
    order.workflow_step === 'ai_generation_completed'
  );
  
  if (hasWorkflow2A) {
    // If preBria is approved, go to workflow 2B
    // Otherwise, keep at 2A (needs review/approval)
    const preBriaStatus = order.review_stages?.preBria?.status;
    // Check for 'approved' status (case-insensitive, handle both string and enum values)
    const isPreBriaApproved = preBriaStatus === 'approved' || 
                              preBriaStatus === 'APPROVED' ||
                              String(preBriaStatus).toLowerCase() === 'approved';
    if (isPreBriaApproved) {
      return '2B';
    }
    // If next_workflow is already set to '2B', preserve it (user explicitly triggered it)
    // This prevents recalculating back to '2A' if review_stages aren't loaded yet
    if (order.next_workflow === '2B') {
      return '2B';
    }
    return '2A';
  }
  
  // 4. Check if order has 1-manifest (from W0) but no other progress
  if (order.one_manifest_url) {
    return '2A';
  }
  
  // 5. No progress - keep current next_workflow or return null
  // IMPORTANT: If next_workflow is already set (manually by user), preserve it
  // This prevents overwriting user's explicit workflow selection
  if (order.next_workflow) {
    return order.next_workflow;
  }
  return null;
}

