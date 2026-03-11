'use client';

import { useEffect, useState } from 'react';

import AnalyticsFilters from '@/components/analytics/AnalyticsFilters';
import CustomizationsTab from '@/components/analytics/CustomizationsTab';
import OverviewTab from '@/components/analytics/OverviewTab';

export interface AnalyticsFiltersState {
  startDate: string;
  endDate: string;
  isTest: 'all' | 'test' | 'production';
  historyScope: 'all' | 'live' | 'archived';
  bookId?: string;
  groupBy: 'day' | 'week' | 'month';
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'customizations'>('overview');
  const [filters, setFilters] = useState<AnalyticsFiltersState>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      isTest: 'production',
      historyScope: 'all',
      groupBy: 'day',
    };
  });
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleRefresh = () => {
    setLastRefresh(new Date());
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const params = new URLSearchParams();
      params.append('startDate', filters.startDate);
      params.append('endDate', filters.endDate);
      if (filters.isTest !== 'all') {
        params.append('isTest', filters.isTest === 'test' ? 'true' : 'false');
      }
      if (filters.bookId) {
        params.append('bookId', filters.bookId);
      }
      params.append('historyScope', filters.historyScope);
      params.append('format', format);

      const response = await fetch(`/api/admin/analytics/export?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `analytics-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Analytics & Reporting</h1>
          <p className="text-gray-600">
            {filters.historyScope === 'all'
              ? 'Operations dashboard across live and archived history.'
              : filters.historyScope === 'archived'
                ? 'Operations dashboard using archived history only.'
                : 'Current operational dashboard using live orders only.'}
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Data View</h2>
              <p className="text-sm text-gray-600">
                Production data is the default. Switch views when you want QA or mixed-history context.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setFilters({ ...filters, isTest: 'all' })}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  filters.isTest === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Data
              </button>
              <button
                onClick={() => setFilters({ ...filters, isTest: 'test' })}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  filters.isTest === 'test'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Test / QA
              </button>
              <button
                onClick={() => setFilters({ ...filters, isTest: 'production' })}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  filters.isTest === 'production'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Production
              </button>
            </div>
          </div>
        </div>

        <AnalyticsFilters
          filters={filters}
          onFiltersChange={setFilters}
          onRefresh={handleRefresh}
          lastRefresh={lastRefresh}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          onExport={handleExport}
        />

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('overview')}
                className={`border-b-2 px-6 py-3 text-sm font-medium ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                Operations
              </button>
              <button
                onClick={() => setActiveTab('customizations')}
                className={`border-b-2 px-6 py-3 text-sm font-medium ${
                  activeTab === 'customizations'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                Customization Insights
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' ? (
              <OverviewTab filters={filters} key={lastRefresh.getTime()} />
            ) : (
              <CustomizationsTab filters={filters} key={lastRefresh.getTime()} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
