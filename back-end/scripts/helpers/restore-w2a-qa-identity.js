/** Canonical single-pose trigger owns identity across the deliberately lean QA branch. */
module.exports = function restoreW2AQAIdentity(input, source) {
  function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
  const context = record(source.orderContext);
  const orderId = text(source.orderId) || text(context.orderId);
  if (!orderId) throw new Error('QA trigger is missing canonical order identity');
  const rootOrderId = text(source.rootOrderId) || text(context.rootOrderId) || text(source.amazonOrderId) || orderId;
  const amazonOrderId = text(source.amazonOrderId) || text(context.amazonOrderId) || rootOrderId;
  const canonical = { orderId, rootOrderId, amazonOrderId };
  for (const candidate of [source, context, input, record(input.orderContext)]) {
    for (const key of Object.keys(canonical)) {
      if (text(candidate[key]) && text(candidate[key]) !== canonical[key]) throw new Error('Conflicting QA order identity: ' + key);
    }
  }
  const retryAttempt = source.retryAttempt === undefined ? 0 : source.retryAttempt;
  if (typeof retryAttempt !== 'number' || !Number.isInteger(retryAttempt) || retryAttempt < 0 || retryAttempt > 3) throw new Error('Invalid QA trigger retry attempt');
  // Intermediate QA nodes historically default the counter to zero. Only the current trigger owns it.
  return { ...input, ...canonical, retryAttempt, orderContext: { ...context, ...canonical } };
};
