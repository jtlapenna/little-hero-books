import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
const base = 'http://127.0.0.1:4398';
const chrome = process.env.CHROME_BIN || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if (!chrome) throw new Error('Set CHROME_BIN to a local Chrome executable');
const server = spawn('node_modules/.bin/astro', ['dev', '--host', '127.0.0.1', '--port', '4398'], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Local test server did not start');
  browser = await chromium.launch({ headless: true, executablePath: chrome });
  const first = { name: 'Alex', age: 4, pronouns: 'they-them', skinTone: 'tan', hairStyle: 'buzz', hairColor: 'black', favoriteColor: 'green', favoriteAnimal: 'dog' };
  const shipping = { name: 'Sam Test', phone: '2125550100', address1: '123 Main St', city: 'New York', state: 'NY', zip: '10001', country: 'US' };
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    const requests = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/checkout/create') {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Validation failed', fields: [{ path: 'books.1.character_specs.animalGuide', message: 'Animal guide selections conflict. Choose one guide.' }] }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ order_id: 'synthetic-order', display_order_id: 'synthetic', stripe_checkout_session_url: `${base}/__synthetic-payment` }) });
      }
      if (url.origin === base && url.pathname === '/__synthetic-payment') {
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Synthetic payment</title><h1>Synthetic payment</h1>' });
      }
      if (url.origin !== base) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(base + '/');
    async function seed(second) {
      const state = { character: first, books: [{ id: '1', character: first }, { id: '2', character: second }], currentBookIndex: 0, checkout: { email: 'test@example.com', shipping, shippingTier: 'mail' } };
      await page.evaluate(value => sessionStorage.setItem('lhb:create-flow:v1', JSON.stringify(value)), state);
      await page.goto(base + '/create/checkout');
    }
    await seed({ ...first, name: undefined, age: undefined });
    await page.getByRole('button', { name: 'Place Order' }).click();
    await page.getByText("Book 2: Enter the child's name.").waitFor();
    await page.getByRole('button', { name: 'Edit book 2' }).first().click();
    assert.equal(await page.locator('#char-name').inputValue(), '');
    assert.equal(await page.locator('#char-age').inputValue(), '');
    assert.equal(requests.length, 0);
    await page.goto(base + '/');
    await seed({ ...first, name: 'Rae', age: 7, favoriteAnimal: 'cat', animalGuide: 'dog', favorite_animal: 'owl' });
    await page.getByRole('button', { name: 'Place Order' }).click();
    await page.getByText('Book 2: Animal guide selections conflict. Choose one guide.').waitFor();
    if (process.env.CHECKOUT_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.CHECKOUT_SCREENSHOT_DIR}/guide-error-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Edit book 2' }).click();
    assert.equal(await page.locator('#char-name').inputValue(), 'Rae');
    await page.getByRole('button', { name: 'Owl', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.goto(base + '/create/checkout');
    assert.equal(await page.locator('#checkout-email').inputValue(), 'test@example.com');
    assert.equal(await page.locator('#checkout-address1').inputValue(), '123 Main St');
    await page.getByRole('button', { name: 'Place Order' }).click();
    await page.getByRole('heading', { name: 'Synthetic payment' }).waitFor();
    assert.equal(page.url(), `${base}/__synthetic-payment`);
    assert.equal(requests.length, 2);
    const latest = requests.at(-1);
    assert.equal(latest.books[1].character_specs.favoriteAnimal, 'owl');
    assert.equal(latest.books[1].character_specs.animalGuide, 'owl');
    assert.equal(latest.books[1].character_specs.favorite_animal, 'owl');
    assert.deepEqual(latest.books[0].character_specs, { ...first, childName: 'Alex' });
    assert.equal(latest.books[1].character_specs.childName, 'Rae');
    assert.equal(latest.books[1].character_specs.age, 7);
    assert.deepEqual(latest.shipping_address, { name: 'Sam Test', phone_number: '2125550100', address_line1: '123 Main St', city: 'New York', state: 'NY', postal_code: '10001', country: 'US' });
    assert.equal(latest.customer_email, 'test@example.com');
    const persisted = await page.evaluate(() => JSON.parse(sessionStorage.getItem('lhb:create-flow:v1')));
    assert.equal(persisted.order.orderId, 'synthetic-order');
    assert.equal(persisted.books[1].character.favoriteAnimal, 'owl');
    console.log(`PASS ${width}px: missing fields stay empty; guide aliases recover; sibling and checkout details retained through synthetic success`);
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
