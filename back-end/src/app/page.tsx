import Link from 'next/link';
import { ArrowRight, BookOpen, Users, Settings } from 'lucide-react';

export default function HomePage() {
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

          <div className="group bg-white rounded-lg shadow-md p-6 opacity-50">
            <div className="flex items-center mb-4">
              <Settings className="h-8 w-8 text-gray-400 mr-3" />
              <h2 className="text-xl font-semibold text-gray-500">Settings</h2>
            </div>
            <p className="text-gray-400 mb-4">
              System configuration and preferences
            </p>
            <div className="flex items-center text-gray-400">
              <span className="text-sm font-medium">Coming Soon</span>
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
          <div className="bg-blue-50 rounded-lg p-6 max-w-2xl mx-auto">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Development Status
            </h3>
            <p className="text-blue-700">
              This is a local development build. R2 integration and n8n webhooks
              will be added in the next phases.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}