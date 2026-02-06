/**
 * D2C Phase 0: Processing/confirmation page after successful checkout.
 * Shows order confirmation, clears sessionStorage, provides status lookup fallback.
 */

import { useEffect, useState, useCallback } from 'react';
import { load, clear } from '../../../lib/createFlow/createFlowStorage';
import type { CreateFlowState } from '../../../lib/createFlow/createFlowSchema';

/** Backend base URL for API calls. */
const API_BASE =
  (import.meta as { env?: { PUBLIC_API_URL?: string; PUBLIC_BACKEND_URL?: string; PROD?: boolean } }).env?.PUBLIC_API_URL ??
  (import.meta as { env?: { PUBLIC_API_URL?: string; PUBLIC_BACKEND_URL?: string; PROD?: boolean } }).env?.PUBLIC_BACKEND_URL ??
  ((import.meta as { env?: { PROD?: boolean } }).env?.PROD ? 'https://admin.littleherolabs.com' : '');

interface OrderStatus {
  status: string;
  statusMessage: string;
  previewUrl?: string;
  trackingUrl?: string;
  trackingNumber?: string;
}

/** Generate display order ID from full UUID: LH-XXXXX */
function formatDisplayOrderId(orderId: string): string {
  return `LH-${orderId.substring(0, 5).toUpperCase()}`;
}

function ProcessingConfirmation() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [displayOrderId, setDisplayOrderId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [charName, setCharName] = useState<string>('your little hero');
  const [showLookup, setShowLookup] = useState(false);
  const [lookupOrderId, setLookupOrderId] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupStatus, setLookupStatus] = useState<OrderStatus | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // On mount: extract order_id from URL or sessionStorage, then clear storage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlOrderId = params.get('order_id');
    const state = load();

    // Get order ID (prefer URL param, fallback to storage)
    const finalOrderId = urlOrderId || state?.order?.orderId || null;
    setOrderId(finalOrderId);
    
    // Get display order ID (prefer storage, fallback to generating from orderId)
    const finalDisplayOrderId = state?.order?.displayOrderId || 
      (finalOrderId ? formatDisplayOrderId(finalOrderId) : null);
    setDisplayOrderId(finalDisplayOrderId);

    // Get email and character name from storage
    if (state?.checkout?.email) {
      setEmail(state.checkout.email);
      setLookupEmail(state.checkout.email);
    }
    if (state?.character?.name) {
      setCharName(state.character.name);
    }
    if (finalDisplayOrderId) {
      setLookupOrderId(finalDisplayOrderId);
    }

    // Clear sessionStorage after successful order
    if (finalOrderId) {
      clear();
    }
  }, []);

  // Handle status lookup
  const handleLookup = useCallback(async () => {
    if (!lookupOrderId.trim() || !lookupEmail.trim()) {
      setLookupError('Please enter both order ID and email.');
      return;
    }

    setIsLookingUp(true);
    setLookupError(null);
    setLookupStatus(null);

    try {
      const statusUrl = `${API_BASE}/api/preview/${encodeURIComponent(lookupOrderId.trim())}/status${lookupEmail.trim() ? `?email=${encodeURIComponent(lookupEmail.trim())}` : ''}`;
      const response = await fetch(statusUrl, { method: 'GET' });

      if (!response.ok) {
        throw new Error('Order not found. Please check your order ID and email.');
      }

      const data = await response.json();
      setLookupStatus({
        status: data.status || 'unknown',
        statusMessage: data.statusMessage || data.status_message || 'Processing your order',
        previewUrl: data.previewUrl || data.preview_url,
        trackingUrl: data.trackingUrl || data.tracking_url,
        trackingNumber: data.trackingNumber || data.tracking_number,
      });
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Failed to look up order status.');
    } finally {
      setIsLookingUp(false);
    }
  }, [lookupOrderId, lookupEmail]);

  // Format status for display
  const formatStatus = (status: string): { label: string; description: string } => {
    const statusMap: Record<string, { label: string; description: string }> = {
      pending_payment: { label: 'Awaiting Payment', description: 'Your payment is being processed.' },
      pending_w0: { label: 'Order Received', description: 'We\'ve received your order and are getting started!' },
      generating: { label: 'Creating Your Book', description: 'Our team is crafting your personalized story.' },
      pending_approval: { label: 'Ready for Review', description: 'Your book is ready! Check your email to approve it.' },
      approved: { label: 'Approved', description: 'Your book has been approved and is being prepared for print.' },
      sent_to_print: { label: 'Sent to Print', description: 'Your book is at the printer!' },
      shipped: { label: 'Shipped', description: 'Your book is on its way!' },
      delivered: { label: 'Delivered', description: 'Your book has arrived. Enjoy!' },
    };
    return statusMap[status] || { label: 'Processing', description: 'Your order is being processed.' };
  };

  return (
    <div className="processing">
      {/* Success header */}
      <div className="processing__header">
        <div className="processing__checkmark">✓</div>
        <h1 className="processing__title">Order Received!</h1>
        <p className="processing__subtitle">
          Thank you for your order. {charName}'s adventure is about to begin!
        </p>
      </div>

      {/* Order details */}
      {orderId && (
        <div className="processing__details">
          <div className="processing__detail-row">
            <span className="processing__detail-label">Order ID</span>
            <span className="processing__detail-value">{displayOrderId}</span>
          </div>
          {email && (
            <div className="processing__detail-row">
              <span className="processing__detail-label">Confirmation sent to</span>
              <span className="processing__detail-value">{email}</span>
            </div>
          )}
        </div>
      )}

      {/* What's next */}
      <div className="processing__next">
        <h2 className="processing__next-title">What happens next?</h2>
        <ol className="processing__steps">
          <li className="processing__step">
            <span className="processing__step-num">1</span>
            <div>
              <strong>We create your book</strong>
              <p>Our team will generate the personalized story and illustrations.</p>
            </div>
          </li>
          <li className="processing__step">
            <span className="processing__step-num">2</span>
            <div>
              <strong>Review & approve</strong>
              <p>We'll email you a preview link within 24-48 hours to approve your book.</p>
            </div>
          </li>
          <li className="processing__step">
            <span className="processing__step-num">3</span>
            <div>
              <strong>Print & ship</strong>
              <p>Once approved, your book will be printed and shipped to you!</p>
            </div>
          </li>
        </ol>
      </div>

      {/* Status lookup section */}
      <div className="processing__lookup">
        <button
          type="button"
          className="processing__lookup-toggle"
          onClick={() => setShowLookup(!showLookup)}
        >
          {showLookup ? 'Hide status lookup' : 'Check order status'}
        </button>

        {showLookup && (
          <div className="processing__lookup-form">
            <p className="processing__lookup-desc">
              Enter your order ID and email to check your order status.
            </p>
            <div className="processing__lookup-fields">
              <div className="processing__lookup-field">
                <label htmlFor="lookup-order-id">Order ID</label>
                <input
                  id="lookup-order-id"
                  type="text"
                  value={lookupOrderId}
                  onChange={(e) => setLookupOrderId(e.target.value)}
                  placeholder="LH-XXXXX"
                  disabled={isLookingUp}
                />
              </div>
              <div className="processing__lookup-field">
                <label htmlFor="lookup-email">Email</label>
                <input
                  id="lookup-email"
                  type="email"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={isLookingUp}
                />
              </div>
            </div>
            <button
              type="button"
              className="processing__lookup-btn"
              onClick={handleLookup}
              disabled={isLookingUp}
            >
              {isLookingUp ? 'Looking up…' : 'Check Status'}
            </button>

            {lookupError && (
              <p className="processing__lookup-error">{lookupError}</p>
            )}

            {lookupStatus && (
              <div className="processing__lookup-result">
                <div className="processing__status-badge">
                  {formatStatus(lookupStatus.status).label}
                </div>
                <p className="processing__status-desc">
                  {lookupStatus.statusMessage || formatStatus(lookupStatus.status).description}
                </p>
                {lookupStatus.trackingUrl && (
                  <a
                    href={lookupStatus.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="processing__tracking-link"
                  >
                    Track your shipment →
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="processing__cta">
        <a href="/" className="processing__btn">
          Return to Home
        </a>
      </div>

      <style>{`
        .processing { max-width: 640px; margin: 0 auto; text-align: center; }
        
        /* Header */
        .processing__header {
          margin-bottom: var(--spacing-xl);
        }
        .processing__checkmark {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: var(--color-teal, #5AC6B1);
          color: #fff;
          font-size: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto var(--spacing-md);
        }
        .processing__title {
          font-family: var(--font-heading);
          font-size: 2rem;
          font-weight: 700;
          color: var(--color-navy-midnight);
          margin: 0 0 var(--spacing-sm);
        }
        .processing__subtitle {
          font-family: var(--font-body);
          font-size: 1.125rem;
          color: var(--color-soft-charcoal);
          margin: 0;
        }
        
        /* Order details */
        .processing__details {
          background: var(--color-warm-sand, #F1FAEE);
          border-radius: 12px;
          padding: var(--spacing-md);
          margin-bottom: var(--spacing-xl);
        }
        .processing__detail-row {
          display: flex;
          justify-content: space-between;
          padding: var(--spacing-sm) 0;
          border-bottom: 1px solid rgba(45,49,66,0.1);
        }
        .processing__detail-row:last-child {
          border-bottom: none;
        }
        .processing__detail-label {
          font-family: var(--font-ui);
          font-size: 0.875rem;
          color: var(--color-soft-charcoal);
        }
        .processing__detail-value {
          font-family: var(--font-ui);
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-navy-midnight);
          word-break: break-all;
        }
        @media (max-width: 420px) {
          .processing__detail-row { flex-direction: column; align-items: flex-start; gap: 0.25rem; }
          .processing__detail-value { word-break: normal; overflow-wrap: anywhere; }
        }
        
        /* What's next */
        .processing__next {
          text-align: left;
          margin-bottom: var(--spacing-xl);
        }
        .processing__next-title {
          font-family: var(--font-ui);
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-navy-midnight);
          margin: 0 0 var(--spacing-md);
        }
        .processing__steps {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .processing__step {
          display: flex;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-md);
        }
        .processing__step-num {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--color-teal, #5AC6B1);
          color: #fff;
          font-family: var(--font-ui);
          font-size: 0.875rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .processing__step strong {
          font-family: var(--font-ui);
          font-size: 0.9375rem;
          color: var(--color-navy-midnight);
        }
        .processing__step p {
          font-family: var(--font-body);
          font-size: 0.875rem;
          color: var(--color-soft-charcoal);
          margin: 0.25rem 0 0;
        }
        
        /* Status lookup */
        .processing__lookup {
          margin-bottom: var(--spacing-xl);
          padding-top: var(--spacing-lg);
          border-top: 1px solid rgba(45,49,66,0.1);
        }
        .processing__lookup-toggle {
          background: none;
          border: none;
          font-family: var(--font-ui);
          font-size: 0.9375rem;
          color: var(--color-teal, #5AC6B1);
          cursor: pointer;
          text-decoration: underline;
        }
        .processing__lookup-form {
          margin-top: var(--spacing-md);
          text-align: left;
        }
        .processing__lookup-desc {
          font-family: var(--font-body);
          font-size: 0.875rem;
          color: var(--color-soft-charcoal);
          margin: 0 0 var(--spacing-md);
        }
        .processing__lookup-fields {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }
        .processing__lookup-field label {
          display: block;
          font-family: var(--font-ui);
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-soft-charcoal);
          margin-bottom: 0.25rem;
        }
        .processing__lookup-field input {
          width: 100%;
          padding: 0.625rem;
          border: 1px solid rgba(45,49,66,0.25);
          border-radius: 8px;
          font-family: var(--font-body);
          font-size: 0.9375rem;
        }
        .processing__lookup-field input:focus {
          outline: 2px solid var(--color-teal);
          outline-offset: 2px;
        }
        .processing__lookup-btn {
          margin-top: var(--spacing-md);
          padding: 0.625rem 1.5rem;
          background: var(--color-teal, #5AC6B1);
          color: #fff;
          border: none;
          border-radius: 8px;
          font-family: var(--font-ui);
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
        }
        .processing__lookup-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .processing__lookup-error {
          color: var(--color-hero-coral);
          font-family: var(--font-body);
          font-size: 0.875rem;
          margin-top: var(--spacing-md);
        }
        .processing__lookup-result {
          margin-top: var(--spacing-md);
          padding: var(--spacing-md);
          background: var(--color-warm-sand, #F1FAEE);
          border-radius: 8px;
        }
        .processing__status-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          background: var(--color-teal, #5AC6B1);
          color: #fff;
          border-radius: 4px;
          font-family: var(--font-ui);
          font-size: 0.8125rem;
          font-weight: 600;
          margin-bottom: var(--spacing-sm);
        }
        .processing__status-desc {
          font-family: var(--font-body);
          font-size: 0.9375rem;
          color: var(--color-soft-charcoal);
          margin: 0;
        }
        .processing__tracking-link {
          display: inline-block;
          margin-top: var(--spacing-sm);
          font-family: var(--font-ui);
          font-size: 0.875rem;
          color: var(--color-teal, #5AC6B1);
        }
        
        /* CTA */
        .processing__cta {
          margin-top: var(--spacing-xl);
        }
        .processing__btn {
          display: inline-block;
          padding: 0.875rem 2rem;
          background: var(--color-hero-coral);
          color: #fff;
          border-radius: 12px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1rem;
          text-decoration: none;
        }
        @media (max-width: 420px) {
          .processing__lookup-btn { width: 100%; }
          .processing__btn { display: block; width: 100%; text-align: center; }
        }
      `}</style>
    </div>
  );
}

export default ProcessingConfirmation;
