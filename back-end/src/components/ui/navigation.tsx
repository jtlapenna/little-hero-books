'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Users, Home, Activity, AlertTriangle, LifeBuoy, ShieldCheck, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navigation() {
  const pathname = usePathname();

  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Orders', href: '/orders', icon: BookOpen },
    { name: 'Review', href: '/review', icon: Users },
    { name: 'Monitoring', href: '/monitoring', icon: Activity },
    { name: 'Orders Needing Attention', href: '/admin/orders-needing-attention', icon: AlertTriangle },
    { name: 'Workflow Jobs', href: '/admin/workflow-jobs', icon: Workflow },
    { name: 'W2A Recovery', href: '/admin/w2a-recovery', icon: LifeBuoy },
    { name: 'W4 Recovery', href: '/admin/w4-recovery', icon: ShieldCheck },
    { name: 'W4.1 Recovery', href: '/admin/w41-recovery', icon: Users },
  ];

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-900">
                Little Hero Labs
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigation.map((item) => {
                const Icon = item.icon;
                // Highlight "Orders Needing Attention" when on unified page or redirect pages
                const isActive = pathname === item.href || 
                  (item.href === '/admin/orders-needing-attention' && 
                   (pathname === '/admin/stuck-orders' || pathname === '/admin/orphaned-orders'));
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium',
                      isActive
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    )}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
          
          <div className="flex items-center">
            <div className="text-sm text-gray-500">
              Development Mode
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
