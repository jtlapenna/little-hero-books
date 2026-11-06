import { z } from 'zod';
import { checkoutPreparationV1, type CheckoutBody } from './checkout-preparation-v1';

export type CheckoutFieldError = { path: string; message: string };
export class CheckoutValidationError extends Error {
  constructor(public fields: CheckoutFieldError[]) { super('Validation failed'); }
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
// These are separate book contracts. Accept only aliases whose meanings agree
// with each book's current W3 consumer; unknown books and values hold.
const bookGuideAliases: Record<string, Record<string, string>> = {
  'book-mvp-simple-adventure': { cat: 'cat', dog: 'dog', owl: 'owl', lion: 'lion', tiger: 'tiger', penguin: 'penguin', unicorn: 'unicorn', 't-rex': 't-rex', 't rex': 't-rex', trex: 't-rex', dinosaur: 't-rex' },
  'book-finding-our-inner-voice': { cat: 'cat', dog: 'dog', owl: 'owl', lion: 'lion', tiger: 'tiger', penguin: 'penguin', unicorn: 'unicorn', 't-rex': 't-rex', 't rex': 't-rex', trex: 't-rex', dinosaur: 't-rex' },
};
function canonicalGuide(bookId: string, value: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(bookGuideAliases, bookId)) return null;
  const aliases = bookGuideAliases[bookId];
  const key = value.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key] : null;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = record(value);
  if (object) return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
export function parseStrictCheckout(body: unknown, defaultBookId: string): CheckoutBody {
  const input = record(body);
  if (!input) return checkoutPreparationV1.parse(body);
  const fields: CheckoutFieldError[] = [];
  const issue = (path: string, message: string) => fields.push({ path, message });
  const product = record(input.product_info);
  const resolveAlias = (obj: RecordValue, keys: string[], path: string): string | undefined => {
    const values: string[] = [];
    for (const key of keys) {
      const value = obj[key];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value !== 'string') { issue(path, 'Enter a valid value.'); continue; }
      const trimmed = value.trim();
      if (trimmed) values.push(trimmed);
    }
    if (new Set(values).size > 1) issue(path, 'Selections conflict. Choose one value.');
    return values[0];
  };
  const bookId = product ? resolveAlias(product, ['bookId', 'book_id'], 'product_info.bookId') ?? defaultBookId : defaultBookId;
  const formatId = product ? resolveAlias(product, ['formatId', 'format_id'], 'product_info.formatId') : undefined;
  const normalizedProduct = product ? { ...product, ...(bookId ? { bookId, book_id: bookId } : {}), ...(formatId ? { formatId, format_id: formatId } : {}) } : input.product_info;
  function normalizeSpecs(value: unknown, path: string): unknown {
    const specs = record(value);
    if (!specs) return value;
    const out = { ...specs };
    const age = specs.age;
    const ageValue = typeof age === 'number' ? age : typeof age === 'string' && /^[0-9]+$/.test(age.trim()) ? Number(age.trim()) : NaN;
    if (!Number.isFinite(ageValue) || !Number.isInteger(ageValue) || ageValue < 0 || ageValue > 10) issue(`${path}.age`, 'Enter a whole age from 0 to 10.');
    else out.age = ageValue;
    const name = resolveAlias(specs, ['childName', 'name'], `${path}.childName`);
    if (name) { out.childName = name; out.name = name; }
    else issue(`${path}.childName`, 'Enter the child’s name.');
    const selections: string[] = [];
    let hadGuide = false;
    for (const key of ['animalGuide', 'favoriteAnimal', 'favorite_animal']) {
      const value = specs[key];
      if (value === undefined) continue;
      hadGuide = true;
      if (typeof value !== 'string' || !value.trim()) { issue(`${path}.animalGuide`, 'Choose a valid animal guide.'); continue; }
      const normalized = canonicalGuide(bookId, value);
      if (!normalized) issue(`${path}.animalGuide`, 'This animal guide is not supported for the selected book.');
      else selections.push(normalized);
    }
    if (new Set(selections).size > 1) issue(`${path}.animalGuide`, 'Animal guide selections conflict. Choose one guide.');
    if (selections.length) { out.animalGuide = selections[0]; out.favoriteAnimal = selections[0]; out.favorite_animal = selections[0]; }
    else if (!hadGuide) issue(`${path}.animalGuide`, 'Choose an animal guide.');
    return out;
  }
  const single = input.character_specs !== undefined ? normalizeSpecs(input.character_specs, 'character_specs') : undefined;
  const books = Array.isArray(input.books) ? input.books.map((entry, index) => {
    const item = record(entry);
    return item ? { ...item, character_specs: normalizeSpecs(item.character_specs, `books.${index}.character_specs`) } : entry;
  }) : input.books;
  if (single !== undefined && Array.isArray(books)) {
    const selected = books.length === 1 ? record(books[0]) : null;
    const equivalent = selected && stable(single) === stable(selected.character_specs) && stable(input.dedication ?? null) === stable(selected.dedication ?? null) && Object.keys(selected).every(key => key === 'character_specs' || key === 'dedication');
    if (!equivalent) issue('books', 'Single-book and book-list selections must match.');
  }
  if (single === undefined && !Array.isArray(books)) issue('character_specs', 'Add a book selection.');
  let parsed: CheckoutBody | undefined;
  try {
    parsed = checkoutPreparationV1.parse({ ...input, ...(product ? { product_info: normalizedProduct } : {}), ...(single !== undefined ? { character_specs: single } : {}), ...(books !== undefined ? { books } : {}) });
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    fields.push(...error.issues.map(item => ({ path: item.path.join('.'), message: item.message })));
  }
  if (fields.length) throw new CheckoutValidationError(fields);
  if (!parsed) throw new Error('Checkout validation failed unexpectedly');
  return parsed;
}
