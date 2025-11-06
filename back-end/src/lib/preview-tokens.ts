/**
 * Preview Token Management
 * 
 * Handles generation and validation of secure preview tokens for customer approval workflow.
 * Tokens are single-use, expire after 3 days, and are cryptographically secure.
 */

import crypto from 'crypto';
import { supabase } from './supabase-client';

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
  // Generate secure token: orderId + random hash
  const randomBytes = crypto.randomBytes(32);
  const hash = crypto.createHash('sha256').update(randomBytes).digest('hex');
  const token = `${orderId}-${hash.substring(0, 16)}`;
  
  // Calculate expiration (3 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 3);
  
  // Store in database
  const { error } = await supabase
    .from('preview_tokens')
    .insert({
      order_id: orderId,
      token: token,
      expires_at: expiresAt.toISOString(),
      created_by: 'system'
    });
  
  if (error) {
    console.error(`[Preview Tokens] Error generating token for order ${orderId}:`, error);
    throw new Error(`Failed to generate preview token: ${error.message}`);
  }
  
  return token;
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
  
  // Check if token has been used
  if (data.used_at) {
    return { 
      valid: false, 
      error: 'Token already used',
      used: true
    };
  }
  
  // Check if token has expired
  const expiresAt = new Date(data.expires_at);
  const now = new Date();
  
  if (expiresAt < now) {
    return { 
      valid: false, 
      error: 'Token expired',
      expired: true
    };
  }
  
  return { 
    valid: true, 
    orderId: data.order_id 
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

