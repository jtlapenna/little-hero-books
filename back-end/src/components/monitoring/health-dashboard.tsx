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
          <div>
            <h2 className="text-xl font-semibold text-gray-900">System Health</h2>
            <p className="text-sm text-gray-600 mt-1">
              Monitor the status of critical services and infrastructure
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(status.overall)}`}>
              {getStatusIcon(status.overall)} {status.overall.toUpperCase()}
            </span>
            <button
              onClick={fetchStatus}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{status.checks.length}</div>
            <div className="text-sm text-gray-500">Services Monitored</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {status.checks.filter(c => c.status === 'healthy').length}
            </div>
            <div className="text-sm text-gray-500">Healthy Services</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {status.checks.filter(c => c.status === 'unhealthy').length}
            </div>
            <div className="text-sm text-gray-500">Unhealthy Services</div>
          </div>
        </div>
      </div>

      {/* Status Legend */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Status Meanings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-start space-x-2">
            <span className="text-green-600">✅</span>
            <div>
              <div className="font-medium text-blue-900">Healthy</div>
              <div className="text-blue-700">Service is operating normally</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <span className="text-yellow-600">⚠️</span>
            <div>
              <div className="font-medium text-blue-900">Degraded</div>
              <div className="text-blue-700">Service is partially functional or unavailable but expected (not a problem)</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <span className="text-red-600">❌</span>
            <div>
              <div className="font-medium text-blue-900">Unhealthy</div>
              <div className="text-blue-700">Service has a critical issue that needs attention</div>
            </div>
          </div>
        </div>
      </div>

      {/* Service Checks */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Service Status</h3>
        <div className="space-y-3">
          {status.checks.map((check, index) => (
            <div key={index} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start space-x-3 flex-1">
                <span className="text-xl mt-0.5">{getStatusIcon(check.status)}</span>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="font-medium text-gray-900">{check.service}</div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(check.status)}`}>
                      {check.status.toUpperCase()}
                    </span>
                  </div>
                  {check.error && (
                    <div className="mt-2">
                      <div className="text-sm font-medium text-gray-700 mb-1">Details:</div>
                      <div className={`text-sm ${
                        check.status === 'degraded' 
                          ? 'text-blue-700 bg-blue-50 p-2 rounded' 
                          : 'text-red-700 bg-red-50 p-2 rounded'
                      }`}>
                        {check.error}
                        {check.error.includes('Cloudflare Workers runtime') && (
                          <div className="mt-1 text-xs text-blue-600">
                            ℹ️ This is normal - Cloudflare Workers run in a serverless environment without traditional file system access. Your application uses R2 Storage instead.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right ml-4">
                {check.responseTime && (
                  <div className="text-sm text-gray-500 mb-1">
                    <span className="font-medium">{check.responseTime}ms</span>
                  </div>
                )}
                <div className="text-xs text-gray-400">
                  {new Date(check.lastChecked).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Service Status Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Service Status Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="text-3xl font-bold text-green-600">
              {status.checks.filter(c => c.status === 'healthy').length}
            </div>
            <div className="text-sm font-medium text-gray-700 mt-1">Healthy</div>
            <div className="text-xs text-gray-500 mt-1">Operating normally</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="text-3xl font-bold text-yellow-600">
              {status.checks.filter(c => c.status === 'degraded').length}
            </div>
            <div className="text-sm font-medium text-gray-700 mt-1">Degraded</div>
            <div className="text-xs text-gray-500 mt-1">Expected limitation</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="text-3xl font-bold text-red-600">
              {status.checks.filter(c => c.status === 'unhealthy').length}
            </div>
            <div className="text-sm font-medium text-gray-700 mt-1">Unhealthy</div>
            <div className="text-xs text-gray-500 mt-1">Needs attention</div>
          </div>
        </div>
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-600">
              <span className="font-medium">Last checked:</span> {new Date(status.timestamp).toLocaleString()}
            </div>
            <div className="text-gray-500">
              Auto-refreshes every 30 seconds
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
