import assert from 'node:assert/strict';
import {
  buildManifestKeyHintOptionsFromOrderLike,
  inferBookIdHintFromOrderLike,
  resolveOrderPathContext,
} from '@/lib/order-paths';

function run(): void {
  const orderId = '847ade56-323c-453c-9982-fcbb006f919c';
  const d2cOrderLike = {
    orderId,
    product_info: {
      bookId: 'book-mvp-simple-adventure',
      formatId: 'standard',
    },
    book_specs: {
      bookId: 'book-mvp-simple-adventure',
      formatId: 'standard',
      title: 'Luca and the Adventure Compass',
    },
  };

  assert.equal(
    inferBookIdHintFromOrderLike(d2cOrderLike),
    'book-mvp-simple-adventure',
    'bookId should resolve from modern D2C order fields before W0 creates manifests',
  );

  const hints = buildManifestKeyHintOptionsFromOrderLike(d2cOrderLike);
  assert.equal(hints.bookId, 'book-mvp-simple-adventure');
  assert.equal(hints.orderPrefix, null);

  const context = resolveOrderPathContext(orderId, hints);
  assert.deepEqual(context, {
    bookId: 'book-mvp-simple-adventure',
    orderPrefix: `book-mvp-simple-adventure/orders/${orderId}`,
  });

  const nestedBookSpecsOnly = {
    orderId,
    product_info: {
      bookSpecs: {
        bookId: 'book-mvp-simple-adventure',
      },
    },
  };

  assert.equal(
    inferBookIdHintFromOrderLike(nestedBookSpecsOnly),
    'book-mvp-simple-adventure',
    'bookId should resolve from nested product_info.bookSpecs',
  );

  console.log('test-order-path-hints: ok');
}

run();
