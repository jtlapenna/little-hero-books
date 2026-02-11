// ⚠️ PLACEHOLDER FILE - Developer A must implement this properly
// This is a temporary placeholder to allow the build to succeed

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  // Always include timezone so operators can sanity-check timestamps.
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function getInitials(name: string): string {
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Format platform name for display
 * Handles special cases like "d2c" -> "D2C" (acronym)
 */
export function formatPlatformName(platform: string): string {
  if (!platform) return 'Amazon';
  const lower = platform.toLowerCase();
  if (lower === 'd2c') return 'D2C';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}