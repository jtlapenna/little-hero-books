/** Only known HTML screens can be returned to after the narrow Access login. */
export const ADMIN_LOGIN_PATH = '/__access_setup';
export const ADMIN_SIGN_IN_HEADER = 'X-LHL-Admin-Sign-In';
const screens = new Set(['/', '/orders', '/review', '/monitoring',
  '/admin/orphaned-orders', '/admin/analytics', '/admin/w3-calibration',
  '/admin/w41-recovery', '/admin/w41-production', '/admin/csv-upload',
  '/admin/stuck-orders', '/admin/w2a-recovery', '/admin/w4-recovery',
  '/admin/workflow-jobs', '/admin/w4-production', '/admin/orders-needing-attention']);
export function adminReturnPath(value: string): string | null {
  if (!value.startsWith('/') || /[\\%?#\s\u0000-\u001f\u007f]/.test(value)) return null;
  const path = value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
  return screens.has(path) || /^\/orders\/[A-Za-z0-9_-]{1,200}$/.test(path) ? path : null;
}
export function adminLoginHref(path = '/'): string {
  return `${ADMIN_LOGIN_PATH}?returnTo=${encodeURIComponent(adminReturnPath(path) ?? '/')}`;
}
export function canonicalAdminOrigin(): string | null {
  // Preview/direct deployment hosts must never become login authorities.
  return process.env.ADMIN_SITE_ORIGIN === 'https://admin.littleherolabs.com'
    ? process.env.ADMIN_SITE_ORIGIN : null;
}
