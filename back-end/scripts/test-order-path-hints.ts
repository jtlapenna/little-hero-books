import assert from 'node:assert/strict';
import {
  buildManifestKeyHintOptionsFromOrderLike,
  inferBookIdHintFromOrderLike,
  resolveOrderPathContext,
  extractOrderPrefixFromPathLike,
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

  const cloudflareManifestUrl =
    `https://little-hero-orders.3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/` +
    `book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json`;

  assert.equal(
    extractOrderPrefixFromPathLike(cloudflareManifestUrl),
    `book-mvp-simple-adventure/orders/${orderId}`,
    'orderPrefix should resolve from Cloudflare storage manifest URLs',
  );

  const cloudflareContext = resolveOrderPathContext(orderId, {
    orderPrefix: cloudflareManifestUrl,
  });

  assert.deepEqual(
    cloudflareContext,
    {
      bookId: 'book-mvp-simple-adventure',
      orderPrefix: `book-mvp-simple-adventure/orders/${orderId}`,
    },
    'Cloudflare storage manifest URLs should normalize to canonical W4 order paths',
  );

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
