'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Users, Settings, AlertTriangle } from 'lucide-react';
import { DisplayStatus } from '@/constants/statuses';

interface ErrorSummary {
  total: number;
  byType: Record<string, number>;
}

export default function HomePage() {
  const [errorSummary, setErrorSummary] = useState<ErrorSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchErrorSummary = async () => {
      try {
        const response = await fetch('/api/admin/orders-needing-attention');
        if (!response.ok) return;
        
        const data = await response.json();
        const orders = data.orders || [];
        
        // Count errors by type
        const byType: Record<string, number> = {};
        orders.forEach((order: any) => {
          const errorType = order.error_type || order.errorReason || 'unknown';
          byType[errorType] = (byType[errorType] || 0) + 1;
        });
        
        setErrorSummary({
          total: orders.length,
          byType
        });
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
            Review and approve AI-generated assets for personalized children's books
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
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
        </div>
      </div>
    </div>
  );
}