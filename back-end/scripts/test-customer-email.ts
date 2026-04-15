#!/usr/bin/env tsx

import { emailsMatchForLookup, normalizeEmailForLookup } from '../src/lib/customer-email';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function main(): void {
  assert(
    normalizeEmailForLookup('plain@example.com') === 'plain@example.com',
    'plain email should remain unchanged',
  );

  assert(
    normalizeEmailForLookup(' Name+Alias@Example.com ') === 'name+alias@example.com',
    'mixed-case plus alias should normalize to lowercase and trim whitespace',
  );

  assert(
    normalizeEmailForLookup('name alias@example.com') === 'name+alias@example.com',
    'spaces should normalize to plus characters for lookup compatibility',
  );

  assert(
    emailsMatchForLookup('Name+Alias@Example.com', ' name alias@example.com '),
    'lookup should treat plus aliases and accidental spaces as equivalent',
  );

  assert(
    !emailsMatchForLookup('name+alias@example.com', 'other@example.com'),
    'different emails must not match',
  );

  console.log('PASS test-customer-email');
}

main();
