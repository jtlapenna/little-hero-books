// Monitoring dashboard page
import HealthDashboard from '@/components/monitoring/health-dashboard';

export default function MonitoringPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900">System Monitoring</h1>
              <p className="mt-2 text-gray-600">
                Monitor system health, performance, and error tracking
              </p>
            </div>
            
            <HealthDashboard refreshInterval={30000} />
          </div>
        </div>
      </div>
    </div>
  );
}

