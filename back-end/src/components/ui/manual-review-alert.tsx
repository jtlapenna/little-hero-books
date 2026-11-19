'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

interface ManualReviewAlertProps {
  executionStatus: string;
  recoveryHref?: string;
  errorMessage?: string | null;
  errorType?: string | null;
  retryCount?: number | null;
  workflowStep?: string | null;
  currentWorkflow?: string | null;
}

/**
 * Manual Review Alert Component
 * 
 * Displays a prominent alert banner when an order requires manual review.
 * Shows context about what happened, why it's marked, what stage it's in, and what should happen next.
 */
export function ManualReviewAlert({
  executionStatus,
  errorMessage,
  errorType,
  retryCount,
  workflowStep,
  currentWorkflow,
  recoveryHref
}: ManualReviewAlertProps) {
  if (executionStatus !== 'error_requires_manual_review') {
    return null;
  }

  const w3Failure = errorType === 'w3_assembly_failed';
  const w2aFailure = errorType?.startsWith('w2a_') === true;
  // Determine what happened
  const getWhatHappened = () => {
    if (w3Failure) return 'Book assembly stopped';
    if (w2aFailure) return errorType === 'w2a_provider_billing' ? 'Character generation stopped: Gemini balance depleted' : 'Character generation stopped';
    if (errorType === 'workflow_timeout') {
      return 'Workflow timed out after multiple retry attempts';
    }
    if (errorType) {
      return `Error: ${errorType}`;
    }
    return 'Order failed after multiple retry attempts';
  };

  // Determine why it's marked
  const getWhyMarked = () => {
    if (w3Failure) return 'The assembly execution ended before creating a job.';
    if (w2aFailure) return 'Generation is on hold until the cause is resolved and an administrator queues a retry.';
    if (retryCount !== null && retryCount !== undefined && retryCount >= 3) {
      return `Maximum retry attempts (${retryCount}) exceeded. Automated recovery system has given up.`;
    }
    return 'Automated recovery system determined this order requires human intervention.';
  };

  // Determine what stage it's in
  const getCurrentStage = () => {
    if (w3Failure) return 'Book Assembly (3)';
    if (w2aFailure) return 'AI Character Generation (2A)';
    if (workflowStep) {
      const stepMap: Record<string, string> = {
        'order_intake': 'Order Intake',
        '2A-complete': 'AI Character Generation (2A)',
        'bria_processing_complete': 'Background Removal (2B)',
        'book_assembly_completed': 'Book Assembly (3)',
        'print_fulfillment': 'Print Fulfillment (4)',
        'customer_approval': 'Customer Approval'
      };
      return stepMap[workflowStep] || workflowStep;
    }
    if (currentWorkflow) {
      return `Workflow ${currentWorkflow}`;
    }
    return 'Unknown stage';
  };

  // Determine what should happen next
  const getNextSteps = () => {
    if (w3Failure) return ['Use Regenerate 3 to retry assembly with the completed images.'];
    if (w2aFailure) return [errorType === 'w2a_provider_billing' ? 'Restore the Gemini project’s prepaid balance in Google AI Studio.' : 'Inspect the failed execution and fix its underlying cause.', 'Open W2A Recovery to verify the failure and queue a retry when ready.'];
    const steps = [
      'Investigate the error message below to understand what went wrong',
      'Check the order data and workflow logs',
      'Fix the underlying issue (data correction, workflow restart, etc.)',
      'Reset the order to ready_for_processing when fixed'
    ];
    return steps;
  };

  return (
    <div className="mb-6 rounded-lg border-2 border-orange-300 bg-orange-50 p-4">
      <div className="flex items-start">
        <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-orange-900 mb-2">
            ⚠️ Manual Review Required
          </h3>
          
          <div className="space-y-2 text-sm text-orange-800">
            <div>
              <span className="font-medium">What happened:</span>{' '}
              {getWhatHappened()}
            </div>
            
            <div>
              <span className="font-medium">Why it's marked:</span>{' '}
              {getWhyMarked()}
            </div>
            
            <div>
              <span className="font-medium">Current stage:</span>{' '}
              {getCurrentStage()}
            </div>
            
            {errorMessage && (
              <div className="mt-2 p-2 bg-orange-100 rounded border border-orange-200">
                <span className="font-medium">Error details:</span>{' '}
                <span className="font-mono text-xs">{errorMessage}</span>
              </div>
            )}
            
            <div className="mt-3 pt-3 border-t border-orange-200">
              <span className="font-medium">What should happen next:</span>
              <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                {getNextSteps().map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ul>
              {w2aFailure && recoveryHref && <Link href={recoveryHref} className="mt-3 inline-flex rounded-md bg-orange-800 px-3 py-2 font-medium text-white hover:bg-orange-900">Open W2A Recovery</Link>}
              {errorType === 'w2a_provider_billing' && <a href="https://aistudio.google.com/projects" target="_blank" rel="noreferrer" className="ml-3 inline-flex underline">Google AI Studio</a>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

