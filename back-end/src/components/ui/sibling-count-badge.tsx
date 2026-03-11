'use client';

import React from 'react';

interface SiblingCountBadgeProps {
  isSibling?: boolean;
  totalSiblings?: number;
  className?: string;
}

export function SiblingCountBadge({
  isSibling,
  totalSiblings,
  className = '',
}: SiblingCountBadgeProps) {
  if (!isSibling) {
    return null;
  }

  const label =
    typeof totalSiblings === 'number' && totalSiblings > 1
      ? `${totalSiblings} books`
      : 'Multi-book';

  return (
    <span
      className={`inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ${className}`.trim()}
    >
      {label}
    </span>
  );
}
