/**
 * Preview Token Management
 * 
 * Handles generation and validation of secure preview tokens for customer approval workflow.
 * Tokens are single-use, expire after 3 days, and are cryptographically secure.
 */

import crypto from 'crypto';
import { supabase } from './supabase-client';

interface PreviewTokenRow {
  token: string;
  order_id: string;
  created_at?: string | null;
  expires_at: string;
  used_at?: string | null;
}

export interface PreviewTokenInfo {
  token: string;
  orderId: string;
  createdAt?: string;
  expiresAt: string;
  usedAt?: string | null;
}

export interface EnsurePreviewTokenResult {
  record: PreviewTokenInfo;
  created: boolean;
}

function mapPreviewTokenRow(row: PreviewTokenRow): PreviewTokenInfo {
  return {
    token: row.token,
    orderId: row.order_id,
    createdAt: row.created_at || undefined,
    expiresAt: row.expires_at,
    usedAt: row.used_at || undefined,
  };
}

async function createPreviewTokenRecord(
  orderId: string,
  createdBy: string = 'system'
): Promise<PreviewTokenInfo> {
  const randomBytes = crypto.randomBytes(32);
  const hash = crypto.createHash('sha256').update(randomBytes).digest('hex');
  const token = `${orderId}-${hash.substring(0, 16)}`;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 3);
  const expiresAtIso = expiresAt.toISOString();

  const { data, error } = await supabase
    .from('preview_tokens')
    .insert({
      order_id: orderId,
      token,
      expires_at: expiresAtIso,
      created_by: createdBy,
    })
    .select('token, order_id, created_at, expires_at, used_at')
    .single();

  if (error || !data) {
    console.error(
      `[Preview Tokens] Error generating token for order ${orderId}:`,
      error
    );
    throw new Error(
      `Failed to generate preview token: ${error?.message || 'Unknown error'}`
    );
  }

  return mapPreviewTokenRow(data as PreviewTokenRow);
}

export interface TokenValidationResult {
  valid: boolean;
  orderId?: string;
  error?: string;
  expired?: boolean;
  used?: boolean;
}

/**
 * Generate a secure preview token for an order
 * 
 * @param orderId - The order ID (amazon_order_id or order id)
 * @returns The generated token (format: [orderId]-[hash])
 */
export async function generatePreviewToken(orderId: string): Promise<string> {
  const record = await createPreviewTokenRecord(orderId);
  return record.token;
}

/**
 * Validate a preview token
 * 
 * @param token - The token to validate
 * @returns Validation result with orderId if valid
 */
export async function validatePreviewToken(token: string): Promise<TokenValidationResult> {
  // Query token from database
  const { data, error } = await supabase
    .from('preview_tokens')
    .select('order_id, expires_at, used_at')
    .eq('token', token)
    .single();
  
  if (error || !data) {
    return { 
      valid: false, 
      error: 'Invalid token' 
    };
  }
  
  // Always include orderId in response, even if token is invalid
  // This allows the API to fetch order data for used/expired tokens
  const orderId = data.order_id;
  
  // Check if token has been used
  if (data.used_at) {
    return { 
      valid: false, 
      error: 'Token already used',
      used: true,
      orderId: orderId // Include orderId so we can still fetch order data
    };
  }
  
  // Check if token has expired
  const expiresAt = new Date(data.expires_at);
  const now = new Date();
  
  if (expiresAt < now) {
    return { 
      valid: false, 
      error: 'Token expired',
      expired: true,
      orderId: orderId // Include orderId so we can still fetch order data
    };
  }
  
  return { 
    valid: true, 
    orderId: orderId 
  };
}

/**
 * Mark a token as used (after approval or rejection)
 * 
 * @param token - The token to mark as used
 * @returns Success status
 */
export async function markTokenAsUsed(token: string): Promise<boolean> {
  const { error } = await supabase
    .from('preview_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token);
  
  if (error) {
    console.error(`[Preview Tokens] Error marking token as used:`, error);
    return false;
  }
  
  return true;
}

/**
 * Get token details (for debugging/admin purposes)
 * 
 * @param token - The token to look up
 * @returns Token details or null
 */
export async function getTokenDetails(token: string) {
  const { data, error } = await supabase
    .from('preview_tokens')
    .select('*')
    .eq('token', token)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data;
}

/**
 * Get all tokens for an order (for admin purposes)
 * 
 * @param orderId - The order ID
 * @returns Array of tokens for the order
 */
export async function getTokensForOrder(orderId: string) {
  const { data, error } = await supabase
    .from('preview_tokens')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error(`[Preview Tokens] Error fetching tokens for order ${orderId}:`, error);
    return [];
  }
  
  return data || [];
}

export async function getActivePreviewToken(
  orderId: string
): Promise<PreviewTokenInfo | null> {
  const { data, error } = await supabase
    .from('preview_tokens')
    .select('token, order_id, created_at, expires_at, used_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error(
      `[Preview Tokens] Error fetching active token for order ${orderId}:`,
      error
    );
    return null;
  }

  const rows = (data || []) as PreviewTokenRow[];
  const now = new Date();

  const activeRow = rows.find((row) => {
    if (row.used_at) return false;
    const expires = new Date(row.expires_at);
    return expires > now;
  });

  if (!activeRow) {
    return null;
  }

  return mapPreviewTokenRow(activeRow);
}

/**
 * Get any non-expired token for an order for building a "view status" link.
 * Used tokens are allowed: the same link works for viewing approval/status/shipping
 * (validate-token returns order data for used tokens; approve page shows status).
 * Use this when sending "sent to print" etc. so the link in the email still works.
 */
export async function getPreviewTokenForOrderLink(
  orderId: string
): Promise<PreviewTokenInfo | null> {
  const { data, error } = await supabase
    .from('preview_tokens')
    .select('token, order_id, created_at, expires_at, used_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !data?.length) return null;

  const now = new Date();
  const row = (data as PreviewTokenRow[]).find((r) => new Date(r.expires_at) > now);
  return row ? mapPreviewTokenRow(row) : null;
}

export async function ensureActivePreviewToken(
  orderId: string
): Promise<EnsurePreviewTokenResult> {
  const existing = await getActivePreviewToken(orderId);

  if (existing) {
    return { record: existing, created: false };
  }

  const record = await createPreviewTokenRecord(orderId);
  return { record, created: true };
}

