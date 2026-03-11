'use client';

import { Download, RefreshCw } from 'lucide-react';

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

const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const;

export default function AnalyticsFilters({
  filters,
  onFiltersChange,
  onRefresh,
  lastRefresh,
  autoRefresh,
  onAutoRefreshChange,
  onExport,
}: AnalyticsFiltersProps) {
  const applyDatePreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    onFiltersChange({
      ...filters,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    });
  };

  const applyAllTimePreset = () => {
    onFiltersChange({
      ...filters,
      startDate: '2024-01-01',
      endDate: new Date().toISOString().split('T')[0],
    });
  };

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    onFiltersChange({ ...filters, [field]: value });
  };

  const handleGroupByChange = (value: 'day' | 'week' | 'month') => {
    onFiltersChange({ ...filters, groupBy: value });
  };

  const handleHistoryScopeChange = (value: 'all' | 'live' | 'archived') => {
    onFiltersChange({ ...filters, historyScope: value });
  };

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Date presets</span>
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => applyDatePreset(preset.days)}
            className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-700"
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={applyAllTimePreset}
          className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-700"
        >
          All time
        </button>
      </div>

      <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Start Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) => handleDateChange('startDate', event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">End Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) => handleDateChange('endDate', event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {filters.bookId !== undefined && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Book ID</label>
            <input
              type="text"
              value={filters.bookId || ''}
              onChange={(event) =>
                onFiltersChange({ ...filters, bookId: event.target.value || undefined })
              }
              placeholder="Filter by book ID"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">History Scope</label>
          <select
            value={filters.historyScope}
            onChange={(event) =>
              handleHistoryScopeChange(event.target.value as 'all' | 'live' | 'archived')
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All History</option>
            <option value="live">Live Only</option>
            <option value="archived">Archived Only</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Group By</label>
          <select
            value={filters.groupBy}
            onChange={(event) => handleGroupByChange(event.target.value as 'day' | 'week' | 'month')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => onAutoRefreshChange(event.target.checked)}
              className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Auto-refresh (5 min)</span>
          </label>

          <span className="text-sm text-gray-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onExport('csv')}
            className="flex items-center gap-2 rounded-md bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={() => onExport('json')}
            className="flex items-center gap-2 rounded-md bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
          >
            <Download className="h-4 w-4" />
            Export JSON
          </button>
        </div>
      </div>
    </div>
  );
}
