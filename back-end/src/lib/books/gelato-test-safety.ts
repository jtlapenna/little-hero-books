/** Engineering tests must stay unconverted. Price and account funding are not production barriers. */
export const GELATO_SIMULATION_ORIGIN = 'https://gelato-simulation.invalid';
export const GELATO_TEST_CONVERSION_DISABLED = 'Engineering conversion is disabled: unpaid tests must remain unconverted drafts';
export const GELATO_LIVE_TESTS_PAUSED = 'Live Gelato tests are paused pending unexpected-fulfillment review';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Explicitly injected, reserved-domain transport preserves historical protocol tests only. */
export function requireGelatoConversionSimulation(dependencies: { simulationOnly?: boolean; fetcher?: typeof fetch }) {
  if (dependencies.simulationOnly !== true || typeof dependencies.fetcher !== 'function') {
    throw new Error(GELATO_TEST_CONVERSION_DISABLED);
  }
}

/** Preserve only warning booleans across normalization, never provider job/payment identifiers. */
export function observeGelatoTestSafetyEvidence(raw: unknown) {
  const source = object(raw);
  const items = Array.isArray(source.items) ? source.items.map(object) : [];
  return {
    printJobsPresent: items.some(item => Array.isArray(item.printJobs) && item.printJobs.length > 0),
    fundingPresent: Boolean(source.paymentMethodId || source.prepaymentTransactionId),
  };
}

export function gelatoTestSafetyReason(raw: unknown): string | null {
  const source = object(raw);
  const items = Array.isArray(source.items) ? source.items.map(object) : [];
  const packages = object(source.shipment).packages;
  const evidence = object(source.testSafetyEvidence);
  const production = ['in_production', 'printed', 'shipped', 'in_transit', 'delivered', 'returned'];
  if ([source.fulfillmentStatus, ...items.map(item => item.fulfillmentStatus)].some(status => production.includes(String(status))) ||
      items.some(item => Array.isArray(item.printJobs) && item.printJobs.length > 0) || evidence.printJobsPresent === true ||
      (Array.isArray(packages) && packages.some(parcel => {
        const code = object(parcel).trackingCode;
        return typeof code === 'string' && code.trim().length > 0;
      }))) return 'unexpected_test_order_production';
  const finance = source.financialStatus ?? object(source.financialObservation).status;
  if (['paid', 'partially_paid', 'invoiced', 'to_be_invoiced', 'partially_refunded', 'refunded'].includes(String(finance))) {
    return 'unexpected_test_order_payment';
  }
  if (source.orderType === 'order') return 'unexpected_test_order_release';
  if (source.paymentMethodId || source.prepaymentTransactionId || evidence.fundingPresent === true) return 'unexpected_test_order_funding';
  if (source.orderType !== 'draft' || finance !== 'draft' || source.fulfillmentStatus !== 'draft' || !items.length ||
      items.some(item => !['draft', 'created'].includes(String(item.fulfillmentStatus)))) return 'test_order_state_unverified';
  return null;
}

export function assertGelatoUnconvertedTestDraft(raw: unknown): void {
  const reason = gelatoTestSafetyReason(raw);
  if (reason) throw new Error('Engineering draft safety check failed: ' + reason);
}
