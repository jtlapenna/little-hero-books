'use client';

import { RefreshCw, Download } from 'lucide-react';
import { AnalyticsFiltersState } from '@/app/admin/analytics/page';

interface AnalyticsFiltersProps {
  filters: AnalyticsFiltersState;
  onFiltersChange: (filters: AnalyticsFiltersState) => void;
  onRefresh: () => void;
  lastRefresh: Date;
  autoRefresh: boolean;
  onAutoRefreshChange: (enabled: boolean) => void;
  onExport: (format: 'csv' | 'json') => void;
}

export default function AnalyticsFilters({
  filters,
  onFiltersChange,
  onRefresh,
  lastRefresh,
  autoRefresh,
  onAutoRefreshChange,
  onExport
}: AnalyticsFiltersProps) {
  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    onFiltersChange({ ...filters, [field]: value });
  };

  const handleTestFilterChange = (value: 'all' | 'test' | 'production') => {
    onFiltersChange({ ...filters, isTest: value });
  };

  const handleGroupByChange = (value: 'day' | 'week' | 'month') => {
    onFiltersChange({ ...filters, groupBy: value });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleDateChange('startDate', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleDateChange('endDate', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Test/Production Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Order Type
          </label>
          <select
            value={filters.isTest}
            onChange={(e) => handleTestFilterChange(e.target.value as 'all' | 'test' | 'production')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Orders</option>
            <option value="test">Test Only</option>
            <option value="production">Production Only</option>
          </select>
        </div>

        {/* Group By */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Group By
          </label>
          <select
            value={filters.groupBy}
            onChange={(e) => handleGroupByChange(e.target.value as 'day' | 'week' | 'month')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => onAutoRefreshChange(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Auto-refresh (5 min)</span>
          </label>

          <span className="text-sm text-gray-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onExport('csv')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => onExport('json')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </button>
        </div>
      </div>
    </div>
  );
}

