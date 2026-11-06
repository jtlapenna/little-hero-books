import assert from 'node:assert/strict';
import { validChildAge, checkoutFieldErrors } from '../src/lib/createFlow/checkoutValidation';

for (const age of [0, 1, 8, 10]) assert.equal(validChildAge(age), true);
for (const age of [-1, 11, 1.5, NaN, Infinity, undefined]) assert.equal(validChildAge(age), false);
const errors = checkoutFieldErrors([
  { path: 'books.1.character_specs.age', message: 'Age must be a whole number from 0 to 10.' },
  { path: 'shipping_address.postal_code', message: 'Invalid postal code.' },
  { path: 'product_info.bookId', message: 'Invalid book.' },
], 2);
assert.deepEqual(errors.books, [{ index: 1, message: 'Age must be a whole number from 0 to 10.' }]);
assert.equal(errors.fields.zip, 'Invalid postal code.');
assert.equal(errors.other[0], 'Invalid book.');
assert.deepEqual(checkoutFieldErrors([{ path: 'character_specs.age', message: 'Invalid age.' }], 1).books, [{index: 0, message: 'Invalid age.'}]);
assert.equal(checkoutFieldErrors([{ path: 'books.9.character_specs.age', message: 'Invalid age.' }], 2).other.length, 1);
console.log('checkout validation tests passed');
