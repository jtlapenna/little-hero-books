// Health monitoring dashboard component
'use client';

import { useState, useEffect } from 'react';
import { SystemStatus, HealthCheck } from '@/lib/monitoring';

interface HealthDashboardProps {
  refreshInterval?: number; // in milliseconds
}

export default function HealthDashboard({ refreshInterval = 30000 }: HealthDashboardProps) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      case 'unhealthy': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✅';
      case 'degraded': return '⚠️';
      case 'unhealthy': return '❌';
      default: return '❓';
    }
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatMemory = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  if (loading && !status) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
            <div className="h-3 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-600 text-xl mr-2">❌</span>
            <h3 className="text-red-800 font-medium">Health Check Failed</h3>
          </div>
          <p className="text-red-600 mt-2">{error}</p>
          <button
            onClick={fetchStatus}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Overall Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">System Health</h2>
          <div className="flex items-center space-x-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(status.overall)}`}>
              {getStatusIcon(status.overall)} {status.overall.toUpperCase()}
            </span>
            <button
              onClick={fetchStatus}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              Refresh
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{formatUptime(status.uptime)}</div>
            <div className="text-sm text-gray-500">Uptime</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{status.errorStats.total}</div>
            <div className="text-sm text-gray-500">Total Errors</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{status.errorStats.unresolved}</div>
            <div className="text-sm text-gray-500">Unresolved</div>
          </div>
        </div>
      </div>

      {/* Service Checks */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Service Status</h3>
        <div className="space-y-3">
          {status.checks.map((check, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <div className="flex items-center space-x-3">
                <span className="text-lg">{getStatusIcon(check.status)}</span>
                <div>
                  <div className="font-medium text-gray-900">{check.service}</div>
                  {check.error && (
                    <div className="text-sm text-red-600">{check.error}</div>
                  )}
                </div>
              </div>
              <div className="text-right">
                {check.responseTime && (
                  <div className="text-sm text-gray-500">{check.responseTime}ms</div>
                )}
                <div className="text-xs text-gray-400">
                  {new Date(check.lastChecked).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-700 mb-2">Memory Usage</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">RSS:</span>
                <span className="text-gray-900 font-medium">{formatMemory(status.performance.memoryUsage.rss)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Heap Used:</span>
                <span className="text-gray-900 font-medium">{formatMemory(status.performance.memoryUsage.heapUsed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Heap Total:</span>
                <span className="text-gray-900 font-medium">{formatMemory(status.performance.memoryUsage.heapTotal)}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-2">Error Statistics</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Critical:</span>
                <span className="text-red-600 font-medium">{status.errorStats.critical}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Recent (24h):</span>
                <span className="text-yellow-600 font-medium">{status.errorStats.recent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Unresolved:</span>
                <span className="text-orange-600 font-medium">{status.errorStats.unresolved}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
