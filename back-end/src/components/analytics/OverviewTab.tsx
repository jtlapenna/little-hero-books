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
  };
  statusBreakdown: Record<string, number>;
  timeSeries: Array<{
    date: string;
    orders: number;
    test: number;
    production: number;
  }>;
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
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

      {/* Status Breakdown */}
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
    </div>
  );
}

