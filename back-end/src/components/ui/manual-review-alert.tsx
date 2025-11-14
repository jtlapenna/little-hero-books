'use client';

import { AlertTriangle } from 'lucide-react';

interface ManualReviewAlertProps {
  executionStatus: string;
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
  currentWorkflow
}: ManualReviewAlertProps) {
  if (executionStatus !== 'error_requires_manual_review') {
    return null;
  }

  // Determine what happened
  const getWhatHappened = () => {
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
    if (retryCount !== null && retryCount !== undefined && retryCount >= 3) {
      return `Maximum retry attempts (${retryCount}) exceeded. Automated recovery system has given up.`;
    }
    return 'Automated recovery system determined this order requires human intervention.';
  };

  // Determine what stage it's in
  const getCurrentStage = () => {
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

