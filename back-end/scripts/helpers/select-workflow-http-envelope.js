// Standalone JavaScript: embedded verbatim in the three n8n HTTP body expressions.
module.exports = function selectWorkflowHttpEnvelope(input) {
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!record(input)) throw Error('Workflow input must be an object');
  const owns = (value, key) => Object.hasOwn(value, key);
  const canonicalFields = ['orderId', 'orderContext', 'workflowParentClaim', 'workflowJobId', 'workflowAttemptId', 'workflowJobIdempotencyKey', 'qaRetryProof', 'renderSnapshot', 'bookId', 'formatId', 'configVersion', 'oneManifestUrl', 'oneManifestKey', 'characterHash', 'poseNumber', 'approvedKey'];
  const canonical = canonicalFields.some(key => owns(input, key));
  if (!canonical) {
    if (!owns(input, 'body')) return input;
    if (!record(input.body)) throw Error('Legacy workflow body must be an object');
    return input.body;
  }
  if (owns(input, 'body') && !record(input.body)) throw Error('Conflicting workflow body envelope');
  const body = input.body;
  if (body) {
    const values = (value, paths) => paths.flatMap(path => {
      let current = value;
      for (const key of path.split('.')) {
        if (!record(current) || !owns(current, key)) return [];
        current = current[key];
      }
      return [current];
    });
    const sorted = value => Array.isArray(value) ? value.map(sorted) : record(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
    const integer = value => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    const manifest = value => {
      if (typeof value !== 'string') return value;
      try { return decodeURIComponent(value.split(/[?#]/, 1)[0].replace(/^https?:\/\/[^/]+/i, '')).replace(/^\/api\/manifests\//, '').replace(/^\/+/, ''); }
      catch (error) { return value; }
    };
    const claim = value => {
      if (!record(value)) return value;
      let startedAt = value.startedAt;
      if (typeof startedAt === 'string') {
        const parts = startedAt.trim().match(/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)?$/);
        if (parts) {
          const date = new Date(startedAt.trim().replace(' ', 'T') + (parts[2] ? '' : 'Z'));
          if (Number.isFinite(date.getTime())) startedAt = date.toISOString().slice(0, 19) + '.' + (parts[1] || '').padEnd(6, '0') + 'Z';
        }
      }
      return { ...value, orderRowId: integer(value.orderRowId), startedAt };
    };
    // Optional database aliases use null/empty placeholders before canonical resolution.
    // Ignore only those absent identity values; canonical selection above still uses OWN presence.
    const check = (label, paths, normalize = value => value, optional = false) => {
      const present = value => !optional || (value !== null && value !== undefined && value !== '');
      const topValues = values(input, paths).filter(present), bodyValues = values(body, paths).filter(present);
      for (const top of topValues) for (const nested of bodyValues) {
        if (JSON.stringify(sorted(normalize(top))) !== JSON.stringify(sorted(normalize(nested)))) {
          throw Error('Conflicting workflow envelope ' + label);
        }
      }
    };
    check('order', ['orderId', 'orderContext.orderId']);
    check('root order', ['rootOrderId', 'root_order_id', 'amazonOrderId', 'amazon_order_id', 'orderContext.rootOrderId', 'orderContext.amazonOrderId'], value => value, true);
    check('physical order', ['id', 'orderDbId', 'workflowParentClaim.orderRowId', 'orderContext.workflowParentClaim.orderRowId'], integer, true);
    check('book', ['bookId', 'book_id', 'print_book_id', 'bookSpecs.bookId', 'bookSpecs.book_id', 'book_specs.bookId', 'book_specs.book_id', 'orderContext.bookId', 'orderContext.bookSpecs.bookId', 'renderSnapshot.bookId'], value => value, true);
    check('format', ['formatId', 'format_id', 'print_format_id', 'bookSpecs.formatId', 'book_specs.formatId', 'book_specs.format_id', 'orderContext.bookSpecs.formatId', 'renderSnapshot.formatId'], value => value, true);
    check('version', ['configVersion', 'config_version', 'print_config_version', 'bookSpecs.configVersion', 'bookSpecs.config_version', 'book_specs.configVersion', 'book_specs.config_version', 'orderContext.bookSpecs.configVersion', 'renderSnapshot.configVersion'], integer, true);
    check('character', ['characterHash', 'character_hash', 'orderContext.characterHash'], value => value, true);
    check('frozen manifest', ['oneManifestUrl', 'one_manifest_url', 'oneManifestKey', 'one_manifest_key', 'orderContext.oneManifestUrl', 'orderContext.one_manifest_url'], manifest, true);
    check('pose', ['poseNumber', 'pose_number', 'currentPoseNumber', 'workingPoseNumber'], integer, true);
    check('parent ownership', ['workflowParentClaim', 'orderContext.workflowParentClaim'], claim);
    for (const key of ['workflowJobId', 'workflowAttemptId', 'workflowJobIdempotencyKey', 'qaRetryProof', 'approvedKey', 'poseIdentityContract']) check(key, [key]);
  }
  const output = { ...input };
  delete output.body;
  return output;
};
