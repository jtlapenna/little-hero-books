export function validChildAge(age: unknown): boolean {
  return typeof age === 'number' && Number.isInteger(age) && age >= 0 && age <= 10;
}

type CheckoutField = 'email' | 'name' | 'phone' | 'address1' | 'city' | 'state' | 'zip';
const checkoutFields: Record<string, CheckoutField> = {
  customer_email: 'email', customer_name: 'name',
  'shipping_address.name': 'name', 'shipping_address.phone_number': 'phone',
  'shipping_address.address_line1': 'address1', 'shipping_address.city': 'city',
  'shipping_address.state': 'state', 'shipping_address.postal_code': 'zip',
};

export function checkoutFieldErrors(input: unknown, bookCount: number): {
  fields: Partial<Record<CheckoutField, string>>;
  books: { index: number; message: string }[];
  other: string[];
} {
  const result: ReturnType<typeof checkoutFieldErrors> = { fields: {}, books: [], other: [] };
  if (!Array.isArray(input)) return result;
  for (const value of input) {
    if (!value || typeof value.path !== 'string' || typeof value.message !== 'string' || !value.message.trim()) continue;
    const field = checkoutFields[value.path];
    if (field) { result.fields[field] = value.message; continue; }
    const match = /^books\.(\d+)\.(character_specs|dedication)(?:\.|$)/.exec(value.path);
    const index = match ? Number(match[1]) : /^(character_specs|dedication)(?:\.|$)/.test(value.path) && bookCount === 1 ? 0 : -1;
    if (Number.isSafeInteger(index) && index >= 0 && index < bookCount) result.books.push({ index, message: value.message });
    else result.other.push(value.message);
  }
  return result;
}
