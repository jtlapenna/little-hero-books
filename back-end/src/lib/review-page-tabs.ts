/**
 * Review Page Tab Configuration
 * 
 * Defines the four tabs for the Review Page and their associated logic.
 * 
 * Last Updated: 2025-11-12
 */

import { OrderListItem } from '@/types/order';
import { LucideIcon } from 'lucide-react';
import { Sparkles, User, Image, FileText, Search } from 'lucide-react';
import {
  shouldShowInReviewPoses,
  shouldShowInReviewBackgrounds,
  shouldShowInReviewPages,
  shouldShowInSecondaryReview,
  shouldShowAsNew,
  getCardLabel,
} from './review-page-filters';

export type ReviewTabId = 'new' | 'poses' | 'backgrounds' | 'pages' | 'secondary';

export interface ReviewTab {
  id: ReviewTabId;
  label: string;
  description: string;
  icon: LucideIcon;
  filterFunction: (order: OrderListItem) => boolean;
  getCardLabel: (order: OrderListItem) => string;
}

/**
 * Tab configuration for the Review Page
 */
export const REVIEW_TABS: ReviewTab[] = [
  {
    id: 'new',
    label: 'New Orders',
    description: 'Orders that have been created but not yet processed',
    icon: Sparkles,
    filterFunction: shouldShowAsNew,
    getCardLabel: (order) => 'New',
  },
  {
    id: 'poses',
    label: 'Review Poses',
    description: 'Review generated character and poses before background removal',
    icon: User,
    filterFunction: shouldShowInReviewPoses,
    getCardLabel: (order) => getCardLabel(order, 'preBria'),
  },
  {
    id: 'backgrounds',
    label: 'Review Backgrounds',
    description: 'Review background-removed images from Bria.ai',
    icon: Image,
    filterFunction: shouldShowInReviewBackgrounds,
    getCardLabel: (order) => getCardLabel(order, 'postBria'),
  },
  {
    id: 'pages',
    label: 'Review Pages',
    description: 'Review final compiled PDF before production',
    icon: FileText,
    filterFunction: shouldShowInReviewPages,
    getCardLabel: (order) => getCardLabel(order, 'postPdf'),
  },
  {
    id: 'secondary',
    label: 'Secondary Review',
    description: 'Review customer revision requests and send to print',
    icon: Search,
    filterFunction: shouldShowInSecondaryReview,
    getCardLabel: (order) => getCardLabel(order, 'secondary'),
  },
];

/**
 * Get a tab by its ID
 */
export function getTabById(id: ReviewTabId): ReviewTab | undefined {
  return REVIEW_TABS.find(tab => tab.id === id);
}

/**
 * Get all orders for a specific tab
 */
export function getOrdersForTab(orders: OrderListItem[], tabId: ReviewTabId): OrderListItem[] {
  const tab = getTabById(tabId);
  if (!tab) {
    return [];
  }
  return orders.filter(tab.filterFunction);
}

