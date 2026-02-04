/**
 * D2C Phase 0: Checkout form with email, shipping address, and Stripe redirect.
 * Loads state from sessionStorage; validates; calls checkout API; redirects to Stripe.
 */

import { useEffect, useState, useCallback } from 'react';
import { load, save, clear } from '../../../lib/createFlow/createFlowStorage';
import type { CreateFlowState, CreateFlowCheckoutShipping } from '../../../lib/createFlow/createFlowSchema';
import { isCharacterStepComplete } from '../../../lib/createFlow/createFlowSelectors';

/** Backend base URL for API calls. */
const API_BASE = (import.meta as { env?: { PUBLIC_BACKEND_URL?: string } }).env?.PUBLIC_BACKEND_URL ?? '';

/** US states for dropdown. */
const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'Washington DC' },
];

interface FormErrors {
  email?: string;
  name?: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
  submit?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidZip(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip.trim());
}

function CheckoutForm() {
  const [state, setState] = useState<CreateFlowState | null>(null);
  const [email, setEmail] = useState('');
  const [shipping, setShipping] = useState<CreateFlowCheckoutShipping>({
    name: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Load state on mount; redirect if character step incomplete
  useEffect(() => {
    const loaded = load();
    if (!loaded || !isCharacterStepComplete(loaded)) {
      window.location.href = '/create/character?toast=missing_state';
      return;
    }
    setState(loaded);
    // Restore saved checkout data if any
    if (loaded.checkout?.email) setEmail(loaded.checkout.email);
    if (loaded.checkout?.shipping) {
      setShipping((prev) => ({ ...prev, ...loaded.checkout?.shipping }));
    }
  }, []);

  // Persist checkout data on change
  const persistCheckout = useCallback((checkoutEmail: string, checkoutShipping: CreateFlowCheckoutShipping) => {
    save({ checkout: { email: checkoutEmail, shipping: checkoutShipping } });
  }, []);

  // Validate all fields
  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!email.trim()) errs.email = 'Email is required';
    else if (!isValidEmail(email)) errs.email = 'Please enter a valid email';
    if (!shipping.name?.trim()) errs.name = 'Name is required';
    if (!shipping.address1?.trim()) errs.address1 = 'Address is required';
    if (!shipping.city?.trim()) errs.city = 'City is required';
    if (!shipping.state?.trim()) errs.state = 'State is required';
    if (!shipping.zip?.trim()) errs.zip = 'ZIP code is required';
    else if (!isValidZip(shipping.zip)) errs.zip = 'Please enter a valid ZIP code';
    return errs;
  }, [email, shipping]);

  // Check if form is valid
  const isValid = Object.keys(validate()).length === 0;

  // Handle field blur for inline validation
  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validate());
    persistCheckout(email, shipping);
  };

  // Handle email change
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (touched.email) setErrors(validate());
  };

  // Handle shipping field change
  const handleShippingChange = (field: keyof CreateFlowCheckoutShipping, value: string) => {
    setShipping((prev) => ({ ...prev, [field]: value }));
    if (touched[field]) setErrors(validate());
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all fields
    const validationErrors = validate();
    setErrors(validationErrors);
    setTouched({ email: true, name: true, address1: true, city: true, state: true, zip: true });
    
    if (Object.keys(validationErrors).length > 0) {
      // Focus first error field
      const firstError = Object.keys(validationErrors)[0];
      document.getElementById(`checkout-${firstError}`)?.focus();
      return;
    }

    if (!state) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      // Generate idempotency key
      const idempotencyKey = crypto.randomUUID();

      // Build request payload
      const payload = {
        customer_email: email.trim(),
        customer_name: shipping.name?.trim(),
        shipping_address: {
          name: shipping.name?.trim(),
          address_line1: shipping.address1?.trim(),
          address_line2: shipping.address2?.trim() || undefined,
          city: shipping.city?.trim(),
          state: shipping.state?.trim(),
          postal_code: shipping.zip?.trim(),
          country: 'US',
        },
        character_specs: {
          ...state.character,
          // Ensure childName is set (backend expects this)
          childName: state.character.name,
        },
        dedication: state.book?.dedication || undefined,
      };

      const response = await fetch(`${API_BASE}/api/checkout/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Checkout failed');
      }

      // Save order info before redirect
      save({ 
        order: { 
          orderId: data.order_id,
          displayOrderId: data.display_order_id,
          stripeCheckoutUrl: data.stripe_checkout_session_url 
        } 
      });

      // Redirect to Stripe
      window.location.href = data.stripe_checkout_session_url;
    } catch (err) {
      setIsSubmitting(false);
      setErrors({ submit: err instanceof Error ? err.message : 'Checkout failed. Please try again.' });
    }
  };

  const handleBack = useCallback(() => {
    window.location.href = '/create/customize';
  }, []);

  if (!state) {
    return <p className="create-loading">Loading…</p>;
  }

  const charName = state.character?.name || 'Your character';

  return (
    <div className="checkout-form">
      <h1 className="checkout-form__title">Checkout</h1>

      <div className="checkout-form__layout">
        {/* Form (left on desktop, bottom on mobile) */}
        <form className="checkout-form__form" onSubmit={handleSubmit} noValidate>
          {/* Contact section */}
          <section className="checkout-form__section">
            <h2 className="checkout-form__section-title">Contact</h2>
            <div className="checkout-form__field">
              <label className="checkout-form__label" htmlFor="checkout-email">
                Email address
              </label>
              <input
                id="checkout-email"
                type="email"
                className={`checkout-form__input ${touched.email && errors.email ? 'checkout-form__input--error' : ''}`}
                value={email}
                onChange={handleEmailChange}
                onBlur={() => handleBlur('email')}
                placeholder="you@example.com"
                disabled={isSubmitting}
                aria-invalid={touched.email && !!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              {touched.email && errors.email && (
                <span id="email-error" className="checkout-form__error" role="alert">{errors.email}</span>
              )}
              <p className="checkout-form__hint">We'll send order updates to this email.</p>
            </div>
          </section>

          {/* Shipping section */}
          <section className="checkout-form__section">
            <h2 className="checkout-form__section-title">Shipping Address</h2>
            <p className="checkout-form__section-note">Currently shipping to US addresses only.</p>

            <div className="checkout-form__field">
              <label className="checkout-form__label" htmlFor="checkout-name">
                Full name
              </label>
              <input
                id="checkout-name"
                type="text"
                className={`checkout-form__input ${touched.name && errors.name ? 'checkout-form__input--error' : ''}`}
                value={shipping.name}
                onChange={(e) => handleShippingChange('name', e.target.value)}
                onBlur={() => handleBlur('name')}
                placeholder="Jane Smith"
                disabled={isSubmitting}
                aria-invalid={touched.name && !!errors.name}
              />
              {touched.name && errors.name && (
                <span className="checkout-form__error" role="alert">{errors.name}</span>
              )}
            </div>

            <div className="checkout-form__field">
              <label className="checkout-form__label" htmlFor="checkout-address1">
                Street address
              </label>
              <input
                id="checkout-address1"
                type="text"
                className={`checkout-form__input ${touched.address1 && errors.address1 ? 'checkout-form__input--error' : ''}`}
                value={shipping.address1}
                onChange={(e) => handleShippingChange('address1', e.target.value)}
                onBlur={() => handleBlur('address1')}
                placeholder="123 Main Street"
                disabled={isSubmitting}
                aria-invalid={touched.address1 && !!errors.address1}
              />
              {touched.address1 && errors.address1 && (
                <span className="checkout-form__error" role="alert">{errors.address1}</span>
              )}
            </div>

            <div className="checkout-form__field">
              <label className="checkout-form__label" htmlFor="checkout-address2">
                Apartment, suite, etc. <span className="checkout-form__optional">(optional)</span>
              </label>
              <input
                id="checkout-address2"
                type="text"
                className="checkout-form__input"
                value={shipping.address2}
                onChange={(e) => handleShippingChange('address2', e.target.value)}
                placeholder="Apt 4B"
                disabled={isSubmitting}
              />
            </div>

            <div className="checkout-form__row">
              <div className="checkout-form__field checkout-form__field--city">
                <label className="checkout-form__label" htmlFor="checkout-city">
                  City
                </label>
                <input
                  id="checkout-city"
                  type="text"
                  className={`checkout-form__input ${touched.city && errors.city ? 'checkout-form__input--error' : ''}`}
                  value={shipping.city}
                  onChange={(e) => handleShippingChange('city', e.target.value)}
                  onBlur={() => handleBlur('city')}
                  placeholder="New York"
                  disabled={isSubmitting}
                  aria-invalid={touched.city && !!errors.city}
                />
                {touched.city && errors.city && (
                  <span className="checkout-form__error" role="alert">{errors.city}</span>
                )}
              </div>

              <div className="checkout-form__field checkout-form__field--state">
                <label className="checkout-form__label" htmlFor="checkout-state">
                  State
                </label>
                <select
                  id="checkout-state"
                  className={`checkout-form__select ${touched.state && errors.state ? 'checkout-form__select--error' : ''}`}
                  value={shipping.state}
                  onChange={(e) => handleShippingChange('state', e.target.value)}
                  onBlur={() => handleBlur('state')}
                  disabled={isSubmitting}
                  aria-invalid={touched.state && !!errors.state}
                >
                  <option value="">Select state</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
                {touched.state && errors.state && (
                  <span className="checkout-form__error" role="alert">{errors.state}</span>
                )}
              </div>

              <div className="checkout-form__field checkout-form__field--zip">
                <label className="checkout-form__label" htmlFor="checkout-zip">
                  ZIP code
                </label>
                <input
                  id="checkout-zip"
                  type="text"
                  className={`checkout-form__input ${touched.zip && errors.zip ? 'checkout-form__input--error' : ''}`}
                  value={shipping.zip}
                  onChange={(e) => handleShippingChange('zip', e.target.value)}
                  onBlur={() => handleBlur('zip')}
                  placeholder="10001"
                  maxLength={10}
                  disabled={isSubmitting}
                  aria-invalid={touched.zip && !!errors.zip}
                />
                {touched.zip && errors.zip && (
                  <span className="checkout-form__error" role="alert">{errors.zip}</span>
                )}
              </div>
            </div>
          </section>

          {/* Submit error */}
          {errors.submit && (
            <div className="checkout-form__submit-error" role="alert">
              {errors.submit}
            </div>
          )}

          {/* CTAs */}
          <div className="checkout-form__ctas">
            <button
              type="button"
              className="checkout-form__btn checkout-form__btn--secondary"
              onClick={handleBack}
              disabled={isSubmitting}
            >
              Back
            </button>
            <button
              type="submit"
              className="checkout-form__btn checkout-form__btn--primary"
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting ? 'Processing…' : 'Place Order'}
            </button>
          </div>

          <p className="checkout-form__secure-note">
            You'll be redirected to Stripe to complete your purchase securely.
          </p>
        </form>

        {/* Order summary (right on desktop, top on mobile) */}
        <aside className="checkout-form__summary">
          <h2 className="checkout-form__summary-title">Order Summary</h2>
          <div className="checkout-form__summary-card">
            <div className="checkout-form__summary-row">
              {state.preview?.imageUrl && (
                <img
                  src={state.preview.imageUrl}
                  alt={`${charName} preview`}
                  className="checkout-form__summary-preview"
                />
              )}
              <div className="checkout-form__summary-details">
                <p className="checkout-form__summary-product">Little Hero Book</p>
                <p className="checkout-form__summary-char">Starring: {charName}</p>
                {state.book?.dedication && (
                  <p className="checkout-form__summary-dedication">
                    Dedication: "{state.book.dedication.slice(0, 50)}{state.book.dedication.length > 50 ? '…' : ''}"
                  </p>
                )}
              </div>
            </div>
            <div className="checkout-form__summary-total">
              <span>Total</span>
              <span className="checkout-form__summary-price">$29.99</span>
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        .checkout-form { width: 100%; max-width: 1100px; margin: 0 auto; position: relative; }
        .create-loading { font-family: var(--font-body); color: var(--color-soft-charcoal); padding: var(--spacing-md); }
        
        .checkout-form__title { 
          font-family: var(--font-heading); 
          font-size: 1.75rem; 
          font-weight: 700; 
          color: var(--color-navy-midnight); 
          margin-bottom: var(--spacing-lg); 
          text-align: center;
        }
        
        /* Layout: form centered, summary floats to the right on desktop */
        .checkout-form__layout {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xl);
        }
        .checkout-form__form { 
          width: 100%;
          max-width: 520px;
          margin: 0 auto;
        }
        .checkout-form__summary {
          order: -1;
        }
        @media (min-width: 1100px) {
          .checkout-form__layout {
            display: block;
          }
          .checkout-form__form { 
            margin: 0 auto;
          }
          .checkout-form__summary { 
            position: absolute;
            right: 0;
            top: 0;
            width: 260px;
          }
        }
        
        /* Order summary */
        .checkout-form__summary-title {
          font-family: var(--font-ui);
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-soft-charcoal);
          margin: 0 0 var(--spacing-sm);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .checkout-form__summary-card {
          background: var(--color-warm-sand, #F1FAEE);
          border-radius: 12px;
          padding: var(--spacing-md);
        }
        .checkout-form__summary-row {
          display: flex;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-md);
        }
        .checkout-form__summary-preview {
          width: 80px;
          height: 80px;
          object-fit: contain;
          border-radius: 8px;
          background: #fff;
        }
        .checkout-form__summary-details { flex: 1; }
        .checkout-form__summary-product {
          font-family: var(--font-heading);
          font-size: 1rem;
          font-weight: 700;
          color: var(--color-navy-midnight);
          margin: 0 0 0.25rem;
        }
        .checkout-form__summary-char,
        .checkout-form__summary-dedication {
          font-family: var(--font-body);
          font-size: 0.875rem;
          color: var(--color-soft-charcoal);
          margin: 0;
        }
        .checkout-form__summary-dedication {
          font-style: italic;
          margin-top: 0.25rem;
        }
        .checkout-form__summary-total {
          display: flex;
          justify-content: space-between;
          padding-top: var(--spacing-md);
          border-top: 1px solid rgba(45,49,66,0.1);
          font-family: var(--font-ui);
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-navy-midnight);
        }
        .checkout-form__summary-price {
          font-size: 1.125rem;
        }
        
        /* Form sections */
        .checkout-form__section {
          margin-bottom: var(--spacing-xl);
        }
        .checkout-form__section-title {
          font-family: var(--font-ui);
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-navy-midnight);
          margin: 0 0 var(--spacing-sm);
        }
        .checkout-form__section-note {
          font-family: var(--font-body);
          font-size: 0.875rem;
          color: var(--color-soft-charcoal);
          margin: 0 0 var(--spacing-md);
        }
        
        /* Form fields */
        .checkout-form__field {
          margin-bottom: var(--spacing-md);
        }
        .checkout-form__label {
          display: block;
          font-family: var(--font-ui);
          font-size: 0.9375rem;
          font-weight: 500;
          color: var(--color-soft-charcoal);
          margin-bottom: 0.5rem;
        }
        .checkout-form__optional {
          font-weight: 400;
          color: #888;
        }
        .checkout-form__input,
        .checkout-form__select {
          width: 100%;
          max-width: 100%;
          padding: 0.875rem 1rem;
          border: 1px solid rgba(45,49,66,0.25);
          border-radius: 8px;
          font-family: var(--font-body);
          font-size: 1rem;
          background: #fff;
          box-sizing: border-box;
        }
        .checkout-form__input:focus,
        .checkout-form__select:focus {
          outline: 2px solid var(--color-teal);
          outline-offset: 2px;
        }
        .checkout-form__input--error,
        .checkout-form__select--error {
          border-color: var(--color-hero-coral);
        }
        .checkout-form__error {
          display: block;
          font-family: var(--font-ui);
          font-size: 0.8125rem;
          color: var(--color-hero-coral);
          margin-top: 0.25rem;
        }
        .checkout-form__hint {
          font-family: var(--font-body);
          font-size: 0.8125rem;
          color: #888;
          margin-top: 0.25rem;
        }
        
        /* Row layout for city/state/zip */
        .checkout-form__row {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--spacing-md);
        }
        @media (min-width: 560px) {
          .checkout-form__row {
            grid-template-columns: 1fr 140px 120px;
          }
        }
        .checkout-form__field--city,
        .checkout-form__field--state,
        .checkout-form__field--zip {
          min-width: 0;
        }
        .checkout-form__field--city { margin-bottom: 0; }
        .checkout-form__field--state { margin-bottom: 0; }
        .checkout-form__field--zip { margin-bottom: 0; }
        
        /* Submit error */
        .checkout-form__submit-error {
          background: #ffebee;
          border: 1px solid rgba(244,67,54,0.3);
          border-radius: 8px;
          padding: var(--spacing-md);
          margin-bottom: var(--spacing-md);
          font-family: var(--font-body);
          font-size: 0.9375rem;
          color: #c62828;
        }
        
        /* CTAs */
        .checkout-form__ctas {
          display: flex;
          flex-wrap: wrap;
          gap: var(--spacing-md);
          margin-top: var(--spacing-lg);
        }
        .checkout-form__btn {
          padding: 0.875rem 2rem;
          border-radius: 12px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          border: none;
          transition: opacity 0.15s;
        }
        .checkout-form__btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .checkout-form__btn--primary {
          background: var(--color-hero-coral);
          color: #fff;
          flex: 1;
        }
        .checkout-form__btn--secondary {
          background: transparent;
          color: var(--color-soft-charcoal);
          border: 1px solid rgba(45,49,66,0.25);
        }
        .checkout-form__btn--secondary:hover:not(:disabled) {
          background: rgba(45,49,66,0.05);
        }
        
        .checkout-form__secure-note {
          font-family: var(--font-body);
          font-size: 0.8125rem;
          color: #888;
          margin-top: var(--spacing-md);
          text-align: center;
        }
      `}</style>
    </div>
  );
}

export default CheckoutForm;
