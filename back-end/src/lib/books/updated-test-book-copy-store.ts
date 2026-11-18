import { getObject, putObject, R2_ORDERS_BUCKET, R2_PUBLIC_BUCKET } from '../r2-client';
import { findExactPreviewOrder } from '../customer-preview-access';
import { supabase } from '../supabase-client';
import { loadRuntimeBookConfig } from './runtime-book-config';
import type { UpdatedBookCopyPorts } from './updated-test-book-copy';

/** Runtime adapter has create-only objects and INSERT, never upsert/update/delete. */
export const updatedTestBookCopyStore: UpdatedBookCopyPorts = {
  loadOrder: orderId => findExactPreviewOrder(orderId),
  loadConfig: () => loadRuntimeBookConfig({ bookId: 'book-finding-our-inner-voice', source: 'published' }),
  async readObject(bucket, key) {
    const response = await getObject(bucket === 'orders' ? R2_ORDERS_BUCKET : R2_PUBLIC_BUCKET, key, { allowNotFound: true });
    if (response.status === 404) return null;
    if (!response.ok) throw Error('Book preparation storage read failed');
    return new Uint8Array(await response.arrayBuffer());
  },
  async createObject(bucket, key, bytes, contentType) {
    const response = await putObject(bucket === 'orders' ? R2_ORDERS_BUCKET : R2_PUBLIC_BUCKET, key, bytes, contentType, { ifNoneMatch: '*' });
    if (response.status === 412) return false;
    if (!response.ok) throw Error('Book preparation storage write failed');
    return true;
  },
  async insertOrder(row) {
    const { error } = await supabase.from('orders').insert(row);
    if (error) throw Error('Updated test book insertion was not confirmed; retry safely');
  },
  now: () => new Date(),
};
