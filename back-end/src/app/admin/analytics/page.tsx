'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Download, Calendar, Filter } from 'lucide-react';
import AnalyticsFilters from '@/components/analytics/AnalyticsFilters';
import OverviewTab from '@/components/analytics/OverviewTab';
import CustomizationsTab from '@/components/analytics/CustomizationsTab';

export interface AnalyticsFiltersState {
  startDate: string;
  endDate: string;
  isTest: 'all' | 'test' | 'production';
  bookId?: string;
  groupBy: 'day' | 'week' | 'month';
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'customizations'>('overview');
  const [filters, setFilters] = useState<AnalyticsFiltersState>(() => {
    // Default to last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      isTest: 'all',
      groupBy: 'day'
    };
  });
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Auto-refresh logic
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, 5 * 60 * 1000); // 5 minutes
    
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
      params.append('format', format);

      const response = await fetch(`/api/admin/analytics/export?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics & Reporting</h1>
          <p className="text-gray-600">Order processing insights and customization analytics</p>
        </div>

        {/* Data Type Toggle - Prominent Switch */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Data View</h2>
              <p className="text-sm text-gray-600">Switch between test and production data</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setFilters({ ...filters, isTest: 'all' })}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filters.isTest === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Orders
              </button>
              <button
                onClick={() => setFilters({ ...filters, isTest: 'test' })}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filters.isTest === 'test'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Test Only
              </button>
              <button
                onClick={() => setFilters({ ...filters, isTest: 'production' })}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filters.isTest === 'production'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Production Only
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <AnalyticsFilters
          filters={filters}
          onFiltersChange={setFilters}
          onRefresh={handleRefresh}
          lastRefresh={lastRefresh}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          onExport={handleExport}
        />

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('customizations')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'customizations'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Customizations
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <OverviewTab filters={filters} key={lastRefresh.getTime()} />
            )}
            {activeTab === 'customizations' && (
              <CustomizationsTab filters={filters} key={lastRefresh.getTime()} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

