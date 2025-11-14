'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OrphanedOrdersPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to unified orders needing attention page
    router.replace('/admin/orders-needing-attention');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-600">Redirecting to Orders Needing Attention...</p>
      </div>
    </div>
  );
}
