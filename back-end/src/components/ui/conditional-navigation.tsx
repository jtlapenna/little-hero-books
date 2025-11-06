'use client';

import { usePathname } from 'next/navigation';
import { Navigation } from './navigation';

/**
 * Conditional Navigation Component
 * 
 * Shows admin navigation on all admin pages.
 * Note: Customer preview pages are now on the customer-facing site (frontend Astro),
 * so this check is no longer needed, but kept for backwards compatibility.
 */
export function ConditionalNavigation() {
  const pathname = usePathname();
  
  // Customer preview pages are now on customer-facing site (frontend Astro)
  // This check is kept for backwards compatibility but shouldn't match anything
  if (pathname?.startsWith('/approve/')) {
    return null;
  }
  
  // Show navigation on all admin pages
  return <Navigation />;
}

