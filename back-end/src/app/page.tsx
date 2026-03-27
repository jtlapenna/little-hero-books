'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Users, Settings, AlertTriangle, BarChart3, LifeBuoy, Workflow } from 'lucide-react';

interface ErrorSummary {
  total: number;
  byType: Record<string, number>;
}

interface OrdersNeedingAttentionResponse {
  orders?: Array<{ error_type?: string | null; errorReason?: string | null }>;
}

interface W2ARecoverySummary {
  candidateCount: number;
  finalizeReady: number;
  replayReady: number;
  inspectNeeded: number;
}

interface W2ARecoveryResponse {
  summary?: W2ARecoverySummary;
}

interface WorkflowJobsSummary {
  activeCount: number;
  retryWaitingCount: number;
  failedCount: number;
  deadLetteredCount: number;
}

interface WorkflowJobsResponse {
  summary?: WorkflowJobsSummary;
}

export default function HomePage() {
  const [errorSummary, setErrorSummary] = useState<ErrorSummary | null>(null);
  const [w2aRecoverySummary, setW2ARecoverySummary] = useState<W2ARecoverySummary | null>(null);
  const [workflowJobsSummary, setWorkflowJobsSummary] = useState<WorkflowJobsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchErrorSummary = async () => {
      try {
        const [attentionResponse, recoveryResponse, workflowJobsResponse] = await Promise.all([
          fetch('/api/admin/orders-needing-attention'),
          fetch('/api/admin/w2a-recovery?hours=72&limit=10'),
          fetch('/api/admin/workflow-jobs?hours=72&limit=12'),
        ]);

        if (attentionResponse.ok) {
          const data = (await attentionResponse.json()) as OrdersNeedingAttentionResponse;
          const orders = data.orders || [];

          const byType: Record<string, number> = {};
          orders.forEach((order) => {
            const errorType = order.error_type || order.errorReason || 'unknown';
            byType[errorType] = (byType[errorType] || 0) + 1;
          });

          setErrorSummary({
            total: orders.length,
            byType,
          });
        }

        if (recoveryResponse.ok) {
          const recoveryData = (await recoveryResponse.json()) as W2ARecoveryResponse;
          setW2ARecoverySummary(recoveryData.summary || null);
        }

        if (workflowJobsResponse.ok) {
          const workflowJobsData = (await workflowJobsResponse.json()) as WorkflowJobsResponse;
          setWorkflowJobsSummary(workflowJobsData.summary || null);
        }

        if (!attentionResponse.ok && !recoveryResponse.ok && !workflowJobsResponse.ok) {
          return;
        }
      } catch (error) {
        console.error('Failed to fetch error summary:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchErrorSummary();
    const interval = setInterval(fetchErrorSummary, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Human-in-the-Loop Asset Review System
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            Review and approve AI-generated assets for personalized children&apos;s books
          </p>
        </div>

        {/* Error Summary Badge */}
        {!loading && errorSummary && errorSummary.total > 0 && (
          <div className="mb-8 max-w-4xl mx-auto">
            <Link
              href="/admin/orders-needing-attention"
              className="block bg-red-50 border-2 border-red-200 rounded-lg p-4 hover:bg-red-100 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <AlertTriangle className="h-6 w-6 text-red-600 mr-3" />
                  <div>
                    <h3 className="text-lg font-semibold text-red-900">
                      {errorSummary.total} Order{errorSummary.total !== 1 ? 's' : ''} Needing Attention
                    </h3>
                    <p className="text-sm text-red-700 mt-1">
                      {Object.entries(errorSummary.byType).slice(0, 3).map(([type, count]) => (
                        <span key={type} className="mr-3">
                          {type}: {count}
                        </span>
                      ))}
                      {Object.keys(errorSummary.byType).length > 3 && '...'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-red-600" />
              </div>
            </Link>
          </div>
        )}

        {!loading && w2aRecoverySummary && w2aRecoverySummary.candidateCount > 0 && (
          <div className="mb-8 max-w-4xl mx-auto">
            <Link
              href="/admin/w2a-recovery"
              className="block bg-amber-50 border-2 border-amber-200 rounded-lg p-4 hover:bg-amber-100 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <LifeBuoy className="h-6 w-6 text-amber-700 mr-3" />
                  <div>
                    <h3 className="text-lg font-semibold text-amber-950">
                      {w2aRecoverySummary.candidateCount} W2A Recovery Candidate{w2aRecoverySummary.candidateCount !== 1 ? 's' : ''}
                    </h3>
                    <p className="text-sm text-amber-800 mt-1">
                      finalize ready: {w2aRecoverySummary.finalizeReady} • replay ready: {w2aRecoverySummary.replayReady} • inspect first: {w2aRecoverySummary.inspectNeeded}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-amber-700" />
              </div>
            </Link>
          </div>
        )}

        {!loading &&
          workflowJobsSummary &&
          workflowJobsSummary.retryWaitingCount +
            workflowJobsSummary.failedCount +
            workflowJobsSummary.deadLetteredCount >
            0 && (
            <div className="mb-8 max-w-4xl mx-auto">
              <Link
                href="/admin/workflow-jobs"
                className="block bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4 hover:bg-indigo-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Workflow className="h-6 w-6 text-indigo-700 mr-3" />
                    <div>
                      <h3 className="text-lg font-semibold text-indigo-950">
                        Shared Workflow Job Signals
                      </h3>
                      <p className="text-sm text-indigo-800 mt-1">
                        retry waiting: {workflowJobsSummary.retryWaitingCount} • failed:{' '}
                        {workflowJobsSummary.failedCount} • dead-lettered:{' '}
                        {workflowJobsSummary.deadLetteredCount} • active:{' '}
                        {workflowJobsSummary.activeCount}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-indigo-700" />
                </div>
              </Link>
            </div>
          )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 max-w-6xl mx-auto">
          <Link
            href="/orders"
            className="group bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center mb-4">
              <BookOpen className="h-8 w-8 text-blue-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">Orders</h2>
            </div>
            <p className="text-gray-600 mb-4">
              View and manage all personalized book orders
            </p>
            <div className="flex items-center text-blue-600 group-hover:text-blue-800">
              <span className="text-sm font-medium">View Orders</span>
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            href="/review"
            className="group bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center mb-4">
              <Users className="h-8 w-8 text-green-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">Review</h2>
            </div>
            <p className="text-gray-600 mb-4">
              Review assets that need human approval
            </p>
            <div className="flex items-center text-green-600 group-hover:text-green-800">
              <span className="text-sm font-medium">Start Review</span>
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            href="/admin/csv-upload"
            className="group bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center mb-4">
              <Settings className="h-8 w-8 text-purple-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">CSV Upload</h2>
            </div>
            <p className="text-gray-600 mb-4">
              Upload Amazon order CSV to populate customer shipping information
            </p>
            <div className="flex items-center text-purple-600 group-hover:text-purple-800">
              <span className="text-sm font-medium">Upload CSV</span>
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            href="/admin/analytics"
            className="group bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center mb-4">
              <BarChart3 className="h-8 w-8 text-amber-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">Analytics</h2>
            </div>
            <p className="text-gray-600 mb-4">
              View current operational reporting for live order activity
            </p>
            <div className="flex items-center text-amber-600 group-hover:text-amber-800">
              <span className="text-sm font-medium">Open Analytics</span>
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            href="/admin/workflow-jobs"
            className="group bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center mb-4">
              <Workflow className="h-8 w-8 text-indigo-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">Workflow Jobs</h2>
            </div>
            <p className="text-gray-600 mb-4">
              Inspect recent `workflow_jobs` across `W2A`, `W2B`, and `W3` without leaving the admin app.
            </p>
            <div className="flex items-center text-indigo-600 group-hover:text-indigo-800">
              <span className="text-sm font-medium">Open Console</span>
              <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
