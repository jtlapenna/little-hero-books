'use client';

import { useState, useEffect } from 'react';
import { AnalyticsFiltersState } from '@/app/admin/analytics/page';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

interface OverviewData {
  metadata: {
    query: any;
    generatedAt: string;
    recordCount: number;
  };
  summary: {
    totalOrders: number;
    testOrders: number;
    productionOrders: number;
    successRate: number;
    errorRate: number;
    completedOrders: number;
    errorOrders: number;
    completedPosesPhase: number;
    completedBackgroundRemovalPhase: number;
    completedPagesPhase: number;
    customerApprovalTotal: number;
    customerApprovedWithRevision: number;
    customerApprovedWithoutRevision: number;
  };
  statusBreakdown: Record<string, number>;
  errorBreakdown: Record<string, number>;
  timeSeries: Array<{
    date: string;
    orders: number;
    test: number;
    production: number;
  }>;
  topCustomizations: {
    skinTone: { value: string; count: number; percentage: number } | null;
    hairColor: { value: string; count: number; percentage: number } | null;
    hairStyle: { value: string; count: number; percentage: number } | null;
    animalGuide: { value: string; count: number; percentage: number } | null;
    hometown: { value: string; count: number; percentage: number } | null;
    pronouns: { value: string; count: number; percentage: number } | null;
    favoriteColor: { value: string; count: number; percentage: number } | null;
    clothingStyle: { value: string; count: number; percentage: number } | null;
  };
  customizationDistributions: {
    skinTone: Array<{ value: string; count: number; percentage: number }>;
    hairColor: Array<{ value: string; count: number; percentage: number }>;
    hairStyle: Array<{ value: string; count: number; percentage: number }>;
    animalGuide: Array<{ value: string; count: number; percentage: number }>;
    hometown: Array<{ value: string; count: number; percentage: number }>;
    pronouns: Array<{ value: string; count: number; percentage: number }>;
    favoriteColor: Array<{ value: string; count: number; percentage: number }>;
    clothingStyle: Array<{ value: string; count: number; percentage: number }>;
  };
}

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

export default function OverviewTab({ filters }: { filters: AnalyticsFiltersState }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
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
        params.append('groupBy', filters.groupBy);

        const response = await fetch(`/api/admin/analytics/overview?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch');
        const result = await response.json();
        setData(result);
      } catch (err: any) {
        setError(err.message || 'Failed to load overview data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading analytics data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">No data available</div>
      </div>
    );
  }

  // Prepare status breakdown for pie chart
  const statusData = Object.entries(data.statusBreakdown).map(([name, value]) => ({
    name,
    value
  }));

  // Prepare error breakdown for chart
  const errorData = Object.entries(data.errorBreakdown || {}).map(([name, value]) => ({
    name,
    value
  })).sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      {/* Summary Cards - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="text-sm font-medium text-blue-600">Total Orders</div>
          <div className="text-2xl font-bold text-blue-900 mt-1">{data.summary.totalOrders}</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <div className="text-sm font-medium text-purple-600">Test Orders</div>
          <div className="text-2xl font-bold text-purple-900 mt-1">{data.summary.testOrders}</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="text-sm font-medium text-green-600">Production Orders</div>
          <div className="text-2xl font-bold text-green-900 mt-1">{data.summary.productionOrders}</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
          <div className="text-sm font-medium text-emerald-600">Success Rate</div>
          <div className="text-2xl font-bold text-emerald-900 mt-1">{data.summary.successRate.toFixed(1)}%</div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
          <div className="text-sm font-medium text-red-600">Error Rate</div>
          <div className="text-2xl font-bold text-red-900 mt-1">{data.summary.errorRate.toFixed(1)}%</div>
        </div>
      </div>

      {/* Summary Cards - Row 2: Workflow Completion */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="text-sm font-medium text-blue-600">Completed Orders</div>
          <div className="text-2xl font-bold text-blue-900 mt-1">{data.summary.completedOrders}</div>
        </div>
        <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
          <div className="text-sm font-medium text-indigo-600">Completed Poses Phase</div>
          <div className="text-2xl font-bold text-indigo-900 mt-1">{data.summary.completedPosesPhase}</div>
        </div>
        <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-200">
          <div className="text-sm font-medium text-cyan-600">Completed Background Removal</div>
          <div className="text-2xl font-bold text-cyan-900 mt-1">{data.summary.completedBackgroundRemovalPhase}</div>
        </div>
        <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
          <div className="text-sm font-medium text-teal-600">Completed Pages Phase</div>
          <div className="text-2xl font-bold text-teal-900 mt-1">{data.summary.completedPagesPhase}</div>
        </div>
      </div>

      {/* Summary Cards - Row 3: Customer Approval */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
          <div className="text-sm font-medium text-amber-600">Customer Approval Total</div>
          <div className="text-2xl font-bold text-amber-900 mt-1">{data.summary.customerApprovalTotal}</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
          <div className="text-sm font-medium text-orange-600">Approved (With Revision)</div>
          <div className="text-2xl font-bold text-orange-900 mt-1">{data.summary.customerApprovedWithRevision}</div>
        </div>
        <div className="bg-lime-50 rounded-lg p-4 border border-lime-200">
          <div className="text-sm font-medium text-lime-600">Approved (No Revision)</div>
          <div className="text-2xl font-bold text-lime-900 mt-1">{data.summary.customerApprovedWithoutRevision}</div>
        </div>
      </div>

      {/* Time Series Chart */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Orders Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.timeSeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={2} name="Total Orders" />
            {filters.isTest === 'all' && (
              <>
                <Line type="monotone" dataKey="test" stroke="#8b5cf6" strokeWidth={2} name="Test Orders" />
                <Line type="monotone" dataKey="production" stroke="#10b981" strokeWidth={2} name="Production Orders" />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Status & Error Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Counts</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Error Breakdown */}
      {errorData.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Error Breakdown by Type</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={errorData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={150} />
              <Tooltip />
              <Bar dataKey="value" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Customization Choices */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Most Popular Customization Choices</h3>
        <div className="flex flex-wrap gap-4">
          {data.topCustomizations.skinTone && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs font-medium text-gray-600 mb-1">Skin Tone</div>
              <div className="text-lg font-bold text-gray-900">{data.topCustomizations.skinTone.value}</div>
              <div className="text-xs text-gray-500">{data.topCustomizations.skinTone.percentage}%</div>
            </div>
          )}
          {data.topCustomizations.hairColor && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs font-medium text-gray-600 mb-1">Hair Color</div>
              <div className="text-lg font-bold text-gray-900">{data.topCustomizations.hairColor.value}</div>
              <div className="text-xs text-gray-500">{data.topCustomizations.hairColor.percentage}%</div>
            </div>
          )}
          {data.topCustomizations.hairStyle && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs font-medium text-gray-600 mb-1">Hair Style</div>
              <div className="text-lg font-bold text-gray-900">{data.topCustomizations.hairStyle.value}</div>
              <div className="text-xs text-gray-500">{data.topCustomizations.hairStyle.percentage}%</div>
            </div>
          )}
          {data.topCustomizations.animalGuide && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs font-medium text-gray-600 mb-1">Animal Guide</div>
              <div className="text-lg font-bold text-gray-900">{data.topCustomizations.animalGuide.value}</div>
              <div className="text-xs text-gray-500">{data.topCustomizations.animalGuide.percentage}%</div>
            </div>
          )}
          {data.topCustomizations.hometown && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs font-medium text-gray-600 mb-1">Hometown</div>
              <div className="text-lg font-bold text-gray-900">{data.topCustomizations.hometown.value}</div>
              <div className="text-xs text-gray-500">{data.topCustomizations.hometown.percentage}%</div>
            </div>
          )}
          {data.topCustomizations.pronouns && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs font-medium text-gray-600 mb-1">Pronouns</div>
              <div className="text-lg font-bold text-gray-900">{data.topCustomizations.pronouns.value}</div>
              <div className="text-xs text-gray-500">{data.topCustomizations.pronouns.percentage}%</div>
            </div>
          )}
          {data.topCustomizations.favoriteColor && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs font-medium text-gray-600 mb-1">Favorite Color</div>
              <div className="text-lg font-bold text-gray-900">{data.topCustomizations.favoriteColor.value}</div>
              <div className="text-xs text-gray-500">{data.topCustomizations.favoriteColor.percentage}%</div>
            </div>
          )}
          {data.topCustomizations.clothingStyle && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs font-medium text-gray-600 mb-1">Clothing Style</div>
              <div className="text-lg font-bold text-gray-900">{data.topCustomizations.clothingStyle.value}</div>
              <div className="text-xs text-gray-500">{data.topCustomizations.clothingStyle.percentage}%</div>
            </div>
          )}
        </div>
      </div>

      {/* Full Customization Breakdowns */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-gray-900">Customization Breakdowns by Trait</h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hair Style Section */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Hair Style</h4>
            <div className="space-y-2">
              {data.customizationDistributions.hairStyle.length > 0 ? (
                data.customizationDistributions.hairStyle.map((item) => (
                  <div key={item.value} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700">{item.value}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{item.count}</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No data available</div>
              )}
            </div>
          </div>

          {/* Animal Guide Section */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Animal Guide</h4>
            <div className="space-y-2">
              {data.customizationDistributions.animalGuide.length > 0 ? (
                data.customizationDistributions.animalGuide.map((item) => (
                  <div key={item.value} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700">{item.value}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{item.count}</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No data available</div>
              )}
            </div>
          </div>

          {/* Hair Color Section */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Hair Color</h4>
            <div className="space-y-2">
              {data.customizationDistributions.hairColor.length > 0 ? (
                data.customizationDistributions.hairColor.map((item) => (
                  <div key={item.value} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700">{item.value}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{item.count}</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No data available</div>
              )}
            </div>
          </div>

          {/* Skin Tone Section */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Skin Tone</h4>
            <div className="space-y-2">
              {data.customizationDistributions.skinTone.length > 0 ? (
                data.customizationDistributions.skinTone.map((item) => (
                  <div key={item.value} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700">{item.value}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{item.count}</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No data available</div>
              )}
            </div>
          </div>

          {/* Pronouns Section */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Pronouns</h4>
            <div className="space-y-2">
              {data.customizationDistributions.pronouns.length > 0 ? (
                data.customizationDistributions.pronouns.map((item) => (
                  <div key={item.value} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700">{item.value}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{item.count}</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No data available</div>
              )}
            </div>
          </div>

          {/* Favorite Color Section */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Favorite Color</h4>
            <div className="space-y-2">
              {data.customizationDistributions.favoriteColor.length > 0 ? (
                data.customizationDistributions.favoriteColor.map((item) => (
                  <div key={item.value} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700">{item.value}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{item.count}</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No data available</div>
              )}
            </div>
          </div>

          {/* Clothing Style Section */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Clothing Style</h4>
            <div className="space-y-2">
              {data.customizationDistributions.clothingStyle.length > 0 ? (
                data.customizationDistributions.clothingStyle.map((item) => (
                  <div key={item.value} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700">{item.value}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{item.count}</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No data available</div>
              )}
            </div>
          </div>

          {/* Hometown Section */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Hometown</h4>
            <div className="space-y-2">
              {data.customizationDistributions.hometown.length > 0 ? (
                data.customizationDistributions.hometown.map((item) => (
                  <div key={item.value} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700">{item.value}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{item.count}</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No data available</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

