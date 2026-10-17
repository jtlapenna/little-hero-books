import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const canonical = readFileSync(new URL('../../database/migration-print-provider-fields.sql', import.meta.url), 'utf8');
const forward = readFileSync(new URL('../../database/20261017201742_gelato_financial_observations.sql', import.meta.url), 'utf8');
for (const name of ['persist_gelato_print_result', 'apply_gelato_provider_snapshots', 'hold_gelato_provider_refresh']) {
  const extract = source => { const start = source.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '('); assert(start >= 0); return source.slice(start, source.indexOf('$$;', start) + 3); };
  assert.equal(extract(forward), extract(canonical), name + ' forward/fresh definitions drifted');
}
console.log('Financial forward/fresh function definitions match');
